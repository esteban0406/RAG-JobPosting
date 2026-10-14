// The postings are mostly in English; without this rule the model tends to
// answer in the language of the context instead of the user's.
export const ANSWER_LANGUAGE_RULE =
  "Answer in the same language as the user's question, even when the job postings are written in another language.";
