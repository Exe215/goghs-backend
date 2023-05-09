import { Prompt } from "../types/history";

export function generateTextFromPrompt(prompt: Prompt): string {
  // TODO: check if values prompt values provided are valid
  console.log(prompt);
  return "a oil portrait of a man wearing sunglasses, in the style of vincent van gogh";
}

function separatePromptTraits(arr: string[]): Map<string, string> {
  if (arr.length > 3) {
    throw new Error("Array should have max of 3 elements");
  }

  // set for checking selected option per trait only occurs once in prompt
  const options = new Set<string>();
  const map = new Map<string, string>();

  arr.forEach((str) => {
    const [option, value] = str.split(":");

    if (options.has(option)) {
      throw new Error(`Option "${option}" occurs more than once`);
    }

    options.add(option);
    map.set(option, value);
  });

  return map;
}
