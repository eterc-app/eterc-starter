import type { TgViewProps } from "@/engine/views-registry";
import { ETERC_FORUM_URL } from "@/engine/config";
import { ResetButton } from "./ResetButton";

/**
 * Ask a Question panel — port of evo/views/ask.php.
 */
export default function EvoAsk({ data }: TgViewProps) {
  const askUrl = String(data.ask_url ?? ETERC_FORUM_URL);

  return (
    <div className="container">
      <h1>Ask a Question</h1>
      <p>
        Post your question on our discussion forums. Grady, our AI assistant,
        or another Eterc developer may be able to help.
      </p>
      <div className="mt-1">
        <a className="button success" href={askUrl} target="_blank" rel="noreferrer">
          Ask a question
        </a>
      </div>
      <div className="mt-1">
        <ResetButton label="Go Back" />
      </div>
    </div>
  );
}

export { EvoAsk };
