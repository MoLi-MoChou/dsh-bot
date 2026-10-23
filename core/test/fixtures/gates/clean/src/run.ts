async function work(): Promise<number> { return 1 }
export async function run(): Promise<void> {
  await work()
  void work()
  work().then(() => undefined)
  const value = await work()
  if (value > 0) return
}
