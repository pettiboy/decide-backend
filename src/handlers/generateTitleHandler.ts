import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export const generateTitleHandler = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { choices } = req.body;

  if (!Array.isArray(choices) || choices.length < 2) {
    res.status(400).json({ error: "At least two choices are required" });
    return;
  }

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that generates concise and engaging poll titles based on the choices provided. Your titles should:
1. Be clear and descriptive
2. Remain neutral and unbiased
3. Be between 3-7 words
4. Capture the essence of the comparison
5. Use proper capitalization
6. Not include phrases like "Which is better" or "Vote for"
7. Focus on the subject matter being compared
8. Never use quotes or special characters
9. Never start with Which, Vote, or Choose
10. Return ONLY the title without any additional text, explanations, or pleasantries
11. Never include phrases like "Here are", "Results for", or "Your"`,
        },
        {
          role: "user",
          content: `Generate a poll title for a comparison between these choices:\n\n${choices.join(
            "\n"
          )}`,
        },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 1,
      max_tokens: 50,
    });

    const generatedTitle = chatCompletion.choices[0]?.message?.content
      ?.trim()
      .replace(/["""]/g, "") // Remove all types of quotes
      .replace(/\//g, "") // Remove forward slashes
      .replace(/^(here are|results for|your)\s+/i, "") // Remove common starting phrases
      .replace(/^the\s+/i, ""); // Optionally remove leading "The" for more conciseness

    if (!generatedTitle) {
      res.status(500).json({ error: "Failed to generate title" });
      return;
    }

    res.status(200).json({ title: generatedTitle });
  } catch (error) {
    console.error("Title generation error:", error);
    res.status(500).json({ error: "Failed to generate title" });
  }
};
