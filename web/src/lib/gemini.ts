import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini API - you'll need to add your API key to environment variables
const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');

export interface SettlementAnalysis {
  reasoning: string;
  resolutionSources: string[];
  settlementCriteria: string;
  isValid: boolean;
  rejectionReason?: string;
}

export async function validateMarketWithGemini(
  question: string,
  expireDate: string,
  expireTime: string
): Promise<SettlementAnalysis> {
  try {
    // Try preferred models with retry/backoff and fallback if overloaded
    const preferredModels = ["gemini-2.5-pro", "gemini-2.5-flash"] as const;

    const prompt = `
You are an expert oracle for prediction markets. Your job is to analyze market questions and determine if they are suitable for prediction market resolution.

Market Question: "${question}"
Expiry Date: ${expireDate}
Expiry Time: ${expireTime}

Please analyze this market question according to these guidelines:

1. **Binary Question Format**: Must be answerable with a clear "Yes" or "No" response
2. **Use Official Names**: Should refer to individuals, organizations, or entities by their full, official names
3. **Specify End Date**: Should include a specific end date in the question
4. **Respectful and Ethical Content**: Must not be offensive, discriminatory, or harmful
5. **Objectively Verifiable**: Must be resolvable through public sources and official announcements
6. **Third-Party Verification**: Must be verifiable by independent parties, not just the market creator

Please respond with a JSON object in this exact format (no code fences, no extra text):
{
  "isValid": true/false,
  "reasoning": "Detailed explanation of why this question is or isn't suitable for prediction markets",
  "resolutionSources": [
    // Provide 2-5 fully-qualified HTTPS URLs to authoritative sources relevant to resolving THIS specific question.
    // Prefer official or primary sources (e.g., .gov, .edu, official company domains, reputable aggregators like coingecko, cmc, exchanges, election commissions, sports leagues).
    // Do NOT include placeholders, generic domain names, search queries, or markdown. URLs only.
    "https://example.com/official-source-1",
    "https://example.com/official-source-2"
  ],
  "settlementCriteria": "Detailed criteria for how this market should be resolved to Yes or No",
  "rejectionReason": "If invalid, explain why it doesn't meet the guidelines (only include if isValid is false)"
}

If the question is invalid, set isValid to false and provide a clear rejectionReason. If valid, set isValid to true and provide detailed reasoning, realistic resolution sources, and precise settlement criteria.

Examples of INVALID questions:
- "What is my name?" (not objectively verifiable by third parties)
- "Will I win the lottery?" (personal, not publicly verifiable)
- "Is the sky blue today?" (too subjective, depends on location/time)

Examples of VALID questions:
- "Will Ethereum reach $5000 by December 31, 2024?" (objectively verifiable through price data)
- "Will the 2024 US Presidential election be won by a Democrat?" (verifiable through official election results)
- "Will Apple release a new iPhone model in 2024?" (verifiable through official announcements)

Respond ONLY with the JSON object, no additional text.
`;

    // Helper: sleep
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Helper: generate with retries per model
    const generateWithRetry = async (modelId: string): Promise<string> => {
      const model = genAI.getGenerativeModel({ model: modelId });
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await model.generateContent(prompt);
          const response = await result.response;
          return response.text();
        } catch (e: any) {
          const message = String(e?.message || e);
          const isOverloaded = message.includes("503") || message.toLowerCase().includes("overloaded");
          if (isOverloaded && attempt < maxAttempts) {
            const backoff = 500 * Math.pow(2, attempt - 1);
            console.warn(`Gemini model ${modelId} overloaded (attempt ${attempt}/${maxAttempts}). Retrying in ${backoff}ms...`);
            await delay(backoff);
            continue;
          }
          // Throw to let outer loop try next model
          throw e;
        }
      }
      throw new Error(`Failed to generate after ${maxAttempts} attempts for model ${modelId}`);
    };

    // Try each model in order
    let text = "";
    let lastError: any = null;
    for (const modelId of preferredModels) {
      try {
        text = await generateWithRetry(modelId);
        console.log(`Gemini response generated with model: ${modelId}`);
        break;
      } catch (e) {
        lastError = e;
        console.warn(`Gemini model ${modelId} failed:`, e);
      }
    }
    if (!text) {
      throw lastError || new Error("All Gemini models failed");
    }

    // Parse the JSON response
    try {
      // Gemini sometimes returns code-fenced JSON (e.g., ```json ... ```)
      // or adds leading text. Clean it before parsing.
      let cleaned = text.trim();
      if (cleaned.startsWith('```')) {
        // remove opening ``` or ```json
        cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '');
        // remove trailing ```
        cleaned = cleaned.replace(/```\s*$/, '');
      }
      // Fallback: slice between the first '{' and the last '}' if present
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      }

      const analysis = JSON.parse(cleaned);
      
      // Validate the response structure
      if (typeof analysis.isValid !== 'boolean') {
        throw new Error('Invalid response: isValid must be boolean');
      }
      
      return {
        reasoning: analysis.reasoning || 'No reasoning provided',
        resolutionSources: Array.isArray(analysis.resolutionSources) ? analysis.resolutionSources : [],
        settlementCriteria: analysis.settlementCriteria || 'No settlement criteria provided',
        isValid: analysis.isValid,
        rejectionReason: analysis.rejectionReason
      };
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', parseError);
      console.error('Raw response:', text);
      
      // Fallback: treat as invalid if we can't parse the response
      return {
        reasoning: 'Unable to analyze question due to parsing error',
        resolutionSources: [],
        settlementCriteria: '',
        isValid: false,
        rejectionReason: 'Technical error in LLM analysis'
      };
    }

  } catch (error) {
    console.error('Gemini API error:', error);
    
    return {
      reasoning: 'Unable to analyze question due to API error',
      resolutionSources: [],
      settlementCriteria: '',
      isValid: false,
      rejectionReason: 'LLM service temporarily unavailable'
    };
  }
}

// Helper function to get Gemini API key from environment
export function getGeminiApiKey(): string {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('NEXT_PUBLIC_GEMINI_API_KEY not found in environment variables');
    return '';
  }
  return apiKey;
}

// Helper function to list available models (for debugging)
export async function listAvailableModels(): Promise<void> {
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + getGeminiApiKey());
    const data = await response.json();
    console.log('Available models:', data);
  } catch (error) {
    console.error('Error listing models:', error);
  }
}
