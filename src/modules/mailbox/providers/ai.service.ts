import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('gemini.apiKey');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.model =
      this.configService.get<string>('gemini.model') || 'gemini-1.5-flash';
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async summarizeEmail(emailContent: string): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });

      const prompt = `You are an AI assistant that summarizes emails concisely.
Please provide a brief, clear summary (2-3 sentences) of the following email content.
Focus on the main purpose, key information, and any action items.

Email content:
${emailContent}

Summary:`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const summary = response.text();

      this.logger.log(`Generated email summary (${summary.length} chars)`);
      return summary.trim();
    } catch (error) {
      this.logger.error(
        'Failed to generate email summary',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Generate embedding vector for email content
   * Uses Gemini text-embedding-004 model (768 dimensions)
   */
  async generateEmbedding(content: string): Promise<number[]> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'text-embedding-004',
      });

      const result = await model.embedContent(content);
      const embedding = result.embedding.values;

      this.logger.log(`Generated embedding (${embedding.length} dimensions)`);
      return embedding;
    } catch (error) {
      this.logger.error(
        'Failed to generate embedding',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Prepare email content for embedding
   * Combines subject, body, and sender info
   */
  prepareEmailContentForEmbedding(email: {
    subject?: string | null;
    bodyText?: string | null;
    fromName?: string | null;
    fromEmail?: string | null;
  }): string {
    const parts: string[] = [];

    if (email.subject) parts.push(`Subject: ${email.subject}`);
    if (email.fromName || email.fromEmail) {
      parts.push(`From: ${email.fromName || email.fromEmail}`);
    }
    if (email.bodyText) {
      // Truncate body to first 2000 chars to stay within token limits
      const bodySnippet = email.bodyText.substring(0, 2000);
      parts.push(`Content: ${bodySnippet}`);
    }

    return parts.join('\n');
  }

  async extractActionItems(emailContent: string): Promise<string[]> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });

      const prompt = `Extract all action items from the following email.
Return ONLY a JSON array of strings, where each string is a distinct action item.
If there are no action items, return an empty array [].

Email content:
${emailContent}

Action items (JSON array only):`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text().trim();

      // Parse JSON response
      const actionItems = JSON.parse(text) as string[];

      this.logger.log(`Extracted ${actionItems.length} action items`);
      return actionItems;
    } catch (error) {
      this.logger.error(
        'Failed to extract action items',
        error instanceof Error ? error.stack : String(error),
      );
      // Return empty array on error
      return [];
    }
  }

  async calculateUrgencyScore(emailContent: string): Promise<number> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });

      const prompt = `Analyze the urgency level of the following email and provide a score from 0 to 10.
- 0-2: Low urgency (informational, newsletters, promotions)
- 3-5: Medium urgency (general inquiries, standard requests)
- 6-8: High urgency (time-sensitive, important decisions needed)
- 9-10: Critical urgency (immediate action required, emergencies)

Return ONLY a single number between 0 and 10.

Email content:
${emailContent}

Urgency score (0-10):`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text().trim();

      // Parse the score
      const score = parseInt(text, 10);

      if (isNaN(score) || score < 0 || score > 10) {
        this.logger.warn(
          `Invalid urgency score received: ${text}, defaulting to 5`,
        );
        return 5;
      }

      this.logger.log(`Calculated urgency score: ${score}`);
      return score;
    } catch (error) {
      this.logger.error(
        'Failed to calculate urgency score',
        error instanceof Error ? error.stack : String(error),
      );
      // Return medium urgency on error
      return 5;
    }
  }
}
