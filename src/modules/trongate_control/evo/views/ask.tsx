import type { TgViewProps } from "@/engine/views-registry";
import { ETERC_FORUM_URL } from "@/engine/config";
import { Button } from "@/components/ui/button";
import { ResetButton } from "./ResetButton";

/**
 * Ask a Question panel — port of evo/views/ask.php.
 */
export default function EvoAsk({ data }: TgViewProps) {
  const askUrl = String(data.ask_url ?? ETERC_FORUM_URL);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <p className="text-sm text-muted-foreground">
        Post your question on our discussion forums. Grady, our AI assistant,
        or another Eterc developer may be able to help.
      </p>
      <Button asChild>
        <a href={askUrl} target="_blank" rel="noreferrer">
          Ask a question
        </a>
      </Button>
      <div>
        <ResetButton label="Go Back" />
      </div>
    </div>
  );
}

export { EvoAsk };
