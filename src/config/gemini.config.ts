import { registerAs } from '@nestjs/config';

export default registerAs('gemini', () => ({
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-2.0-flash', // Fast and cost-effective for summarization
}));
