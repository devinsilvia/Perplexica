import generateSuggestions from '@/lib/agents/suggestions';
import ModelRegistry from '@/lib/models/registry';
import { ModelWithProvider } from '@/lib/models/types';

interface SuggestionsGenerationBody {
  chatHistory: any[];
  chatModel: ModelWithProvider;
}

export const POST = async (req: Request) => {
  try {
    const body: SuggestionsGenerationBody = await req.json();

    const registry = new ModelRegistry();

    const llm = await registry.loadChatModel(
      body.chatModel.providerId,
      body.chatModel.key,
    );

    const normalizedHistory = body.chatHistory.map((item: any) => {
      if (Array.isArray(item)) {
        const [role, content] = item;
        return {
          role: role === 'human' ? 'user' : role,
          content,
        };
      }

      return {
        role: item.role === 'human' ? 'user' : item.role,
        content: item.content,
      };
    });

    const suggestions = await generateSuggestions(
      {
        chatHistory: normalizedHistory,
      },
      llm,
    );

    return Response.json({ suggestions }, { status: 200 });
  } catch (err) {
    console.error(`An error occurred while generating suggestions: ${err}`);
    return Response.json(
      { message: 'An error occurred while generating suggestions' },
      { status: 500 },
    );
  }
};
