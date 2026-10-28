// Thrown by every planning algorithm stub until its owner implements it.
// Pages check `error.code === 'NOT_IMPLEMENTED'` to show a placeholder instead of a failure.
//
// Each stub documents its contract; the matching todo tests in
// src/utils/__tests__/planning.test.js describe the expected behaviour.
export class NotImplementedError extends Error {
  constructor(name) {
    super(`${name} is not implemented yet`)
    this.name = 'NotImplementedError'
    this.code = 'NOT_IMPLEMENTED'
  }
}
