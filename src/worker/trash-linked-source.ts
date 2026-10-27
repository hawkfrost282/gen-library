/** Literal paths only: characters such as [ ] * ? in a filename must never expand to other files. */
export async function trashLinkedSource(sourcePath: string): Promise<void> {
  const { default: trash } = await import('trash');
  await trash([sourcePath], { glob: false });
}
