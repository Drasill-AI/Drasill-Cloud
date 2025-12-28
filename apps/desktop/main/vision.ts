/**
 * Vision Module - Hybrid CV + GPT-4V Component Detection
 * 
 * Uses local CV for geometry detection (bounding boxes)
 * Uses GPT-4V for semantic labeling (component names/categories)
 * 
 * This approach:
 * - Eliminates hallucinated components (CV finds real edges only)
 * - Reduces API costs (only send coordinates, not full detection)
 * - Works offline for detection (labeling needs API)
 */
import OpenAI from 'openai';
import * as keychain from './keychain';

let openai: OpenAI | null = null;

// Detected region from CV (renderer sends this)
export interface CVDetectedRegion {
  id: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  area: number;
  centroid: { x: number; y: number };
}

// Labeled component (GPT-4V returns this)
export interface LabeledComponent {
  id: string;
  name: string;
  category: 'structure' | 'mechanical' | 'electrical' | 'body' | 'interior' | 'other';
  confidence: number;
  description: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface LabelingResult {
  success: boolean;
  components: LabeledComponent[];
  summary?: string;
  error?: string;
}

/**
 * Initialize OpenAI client with stored API key
 */
async function getOpenAI(): Promise<OpenAI | null> {
  if (!openai) {
    const apiKey = await keychain.getApiKey();
    if (apiKey) {
      openai = new OpenAI({ apiKey });
    }
  }
  return openai;
}

/**
 * Reset OpenAI client (for when API key changes)
 */
export function resetVisionOpenAI(): void {
  openai = null;
}

/**
 * Label detected regions using GPT-4V
 * 
 * This is much cheaper than full detection because:
 * 1. We already know WHERE components are (from CV)
 * 2. We just ask GPT to identify WHAT they are
 * 3. Structured output prevents hallucinations
 */
export async function labelDetectedRegions(
  imageBase64: string,
  regions: CVDetectedRegion[],
  context?: string
): Promise<LabelingResult> {
  const client = await getOpenAI();
  
  if (!client) {
    return {
      success: false,
      components: [],
      error: 'OpenAI API key not configured',
    };
  }
  
  if (regions.length === 0) {
    return {
      success: true,
      components: [],
      summary: 'No regions detected',
    };
  }
  
  // Build region descriptions for the prompt
  const regionDescriptions = regions.map((r, i) => 
    `Region ${i + 1} (id: ${r.id}): bounding box at (${r.bbox.x}, ${r.bbox.y}) size ${r.bbox.width}x${r.bbox.height}, area ${r.area}px`
  ).join('\n');
  
  const contextHint = context ? `\nContext: This appears to be ${context}.` : '';
  
  const prompt = `I have detected ${regions.length} component regions in this technical/engineering image using edge detection.${contextHint}

For each detected region, identify what component it likely represents. Be specific and technical.

Detected regions:
${regionDescriptions}

For each region, provide:
1. A specific technical name (e.g., "Front Axle Assembly", "Hydraulic Cylinder", "Control Panel")
2. Category: structure, mechanical, electrical, body, interior, or other
3. Confidence (0.0-1.0) based on how clearly you can identify it
4. Brief description of the component's function

Respond in JSON format:
{
  "components": [
    {
      "id": "region_id",
      "name": "Component Name",
      "category": "category",
      "confidence": 0.9,
      "description": "Brief description"
    }
  ],
  "summary": "Overall description of what this appears to be"
}`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageBase64.startsWith('data:') 
                  ? imageBase64 
                  : `data:image/png;base64,${imageBase64}`,
                detail: 'high',
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.3, // Lower temperature for more consistent labeling
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        success: false,
        components: [],
        error: 'Empty response from GPT-4V',
      };
    }
    
    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        success: false,
        components: [],
        error: 'Could not parse JSON response',
      };
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Merge labels with original bounding boxes
    const labeledComponents: LabeledComponent[] = parsed.components.map((comp: any) => {
      const region = regions.find(r => r.id === comp.id);
      return {
        id: comp.id,
        name: comp.name || 'Unknown Component',
        category: comp.category || 'other',
        confidence: comp.confidence || 0.5,
        description: comp.description || '',
        bbox: region?.bbox || { x: 0, y: 0, width: 0, height: 0 },
      };
    });
    
    return {
      success: true,
      components: labeledComponents,
      summary: parsed.summary,
    };
    
  } catch (error) {
    console.error('[Vision] Labeling error:', error);
    return {
      success: false,
      components: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate an exploded view diagram using DALL-E 3
 */
export async function generateExplodedView(
  components: LabeledComponent[],
  summary: string,
  options: {
    whiteBackground?: boolean;
    showLabels?: boolean;
    style?: 'technical' | 'artistic';
  } = {}
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  const client = await getOpenAI();
  
  if (!client) {
    return {
      success: false,
      error: 'OpenAI API key not configured',
    };
  }
  
  const {
    whiteBackground = true,
    showLabels = true,
    style = 'technical',
  } = options;
  
  // Build component list for prompt
  const componentList = components
    .filter(c => c.confidence > 0.5)
    .map(c => `- ${c.name} (${c.category})`)
    .join('\n');
  
  const backgroundStyle = whiteBackground 
    ? 'clean white background' 
    : 'subtle gradient background';
  
  const labelStyle = showLabels 
    ? 'with labeled callouts pointing to each component' 
    : 'without labels';
  
  const artStyle = style === 'technical'
    ? 'precise technical illustration style, like an engineering manual'
    : 'detailed artistic rendering with subtle shading';
  
  const prompt = `Create an exploded axonometric view diagram of: ${summary}

Components to show separated and floating:
${componentList}

Style requirements:
- ${artStyle}
- ${backgroundStyle}
- ${labelStyle}
- Components separated along a 45-degree axis showing assembly order
- Clean lines, professional technical illustration
- Each component clearly visible and identifiable`;

  try {
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'hd',
      style: 'natural',
    });
    
    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      return {
        success: false,
        error: 'No image returned from DALL-E',
      };
    }
    
    return {
      success: true,
      imageUrl,
    };
    
  } catch (error) {
    console.error('[Vision] Generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
