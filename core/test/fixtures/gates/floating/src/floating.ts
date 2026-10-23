async function work(): Promise<number> { return 1 }
export async function run(): Promise<void> {
  work()
  await work()
  void work()
  work().then(() => undefined)
}
