const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const ID_LENGTH = 7;

export async function generateUniqueId(
  checkExists: (id: string) => Promise<boolean>
): Promise<string> {
  let id: string;
  let exists: boolean;

  do {
    // Generate a random 7-character string
    id = Array.from(
      { length: ID_LENGTH },
      () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
    ).join("");

    // Check if it exists
    exists = await checkExists(id);
  } while (exists);

  return id;
}
