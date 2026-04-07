import { GoogleGenerativeAI } from '@google/generative-ai';

export interface GenerateRetryOptions {
  apiKey: string;
  prompt: string;
  log?: (level: 'info' | 'ok' | 'warn' | 'error', msg: string) => void;
  primaryModel?: string;
  fallbackModels?: string[];
  maxRetriesPerModel?: number;
}

/**
 * Helper to generate content using Google Generative AI (Gemini) with robust 
 * retry logic and model fallbacks for rate limits and 503 errors.
 */
export async function generateContentWithRetry({
  apiKey,
  prompt,
  log,
  primaryModel = 'gemini-2.5-flash',
  fallbackModels = ['gemini-1.5-flash', 'gemini-2.5-pro'],
  maxRetriesPerModel = 3
}: GenerateRetryOptions): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const logger = log || ((level, msg) => {
    if (level === 'error') console.error(msg);
    else if (level === 'warn') console.warn(msg);
    else console.log(`[${level.toUpperCase()}] ${msg}`);
  });
  
  // Create a priority array of models
  const modelsToTry = [primaryModel, ...fallbackModels];

  for (const modelName of modelsToTry) {
    for (let attempt = 1; attempt <= maxRetriesPerModel; attempt++) {
      try {
        if (modelsToTry.length > 1 && attempt === 1 && modelName !== primaryModel) {
             logger('info', `Falling back to model: ${modelName}`);
        }
        
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        if (text) return text;
        throw new Error(`Model ${modelName} returned empty response`);
      } catch (error: any) {
        // Look for common transient errors (503 Service Unavailable, 429 Too Many Requests, connection drops)
        const isTransient = error.message && (
          error.message.includes('503') || 
          error.message.includes('429') || 
          error.message.includes('fetch failed') ||
          error.message.includes('timeout') ||
          error.message.includes('High demand')
        );

        logger('warn', `Gemini (${modelName}) attempt ${attempt}/${maxRetriesPerModel} failed: ${error.message}`);

        if (isTransient && attempt < maxRetriesPerModel) {
          // Exponential backoff
          const waitMs = attempt * 2000;
          logger('info', `Waiting ${waitMs}ms before retrying ${modelName}...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        } else {
          // If out of retries for this model or it's a hard error like 400 Bad Request, move to the next model
          break;
        }
      }
    }
  }

  throw new Error("All configured Gemini models failed. The AI service is currently unavailable. Please try again later.");
}
