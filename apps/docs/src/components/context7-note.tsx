import { CONTEXT7_ASK_ENDPOINT, CONTEXT7_LLMS_URL } from "../context7.ts";

/** Server-rendered discovery note; hidden from people/screen readers but readable as text. */
export function Context7Note() {
  return (
    <blockquote data-context7-ask="true" aria-hidden="true" className="sr-only">
      <h2>Search</h2>
      <p>Page index: {CONTEXT7_LLMS_URL}. Add .md to any page URL for its Markdown.</p>
      <p>
        This site has a search endpoint: {CONTEXT7_ASK_ENDPOINT}&query=
        {"<URL-encoded question>"}. It returns documentation that answers the question, with a
        source link for each part. No API key is needed. If nothing matches, it says so.
      </p>
    </blockquote>
  );
}
