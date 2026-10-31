const { isDeepStrictEqual } = require('node:util');

function checkTrue(value, message = 'Expected a truthy value') {
  if (!value) throw new Error(message);
}

function checkEqual(actual, expected, message) {
  if (!Object.is(actual, expected)) {
    throw new Error(message || `Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function checkDeepEqual(actual, expected, message = 'Values differ') {
  if (!isDeepStrictEqual(actual, expected)) throw new Error(message);
}

function checkThrows(run, expected) {
  try {
    run();
  } catch (error) {
    if (expected instanceof RegExp && !expected.test(error.message)) {
      throw new Error(`Unexpected error message: ${error.message}`);
    }
    if (typeof expected === 'function' && !(error instanceof expected)) {
      throw new Error(`Expected ${expected.name}, received ${error.constructor.name}`);
    }
    return;
  }
  throw new Error('Expected an error, but the operation succeeded');
}

async function checkRejects(run, expectedMessage) {
  try {
    await run();
  } catch (error) {
    if (expectedMessage && !error.message.includes(expectedMessage)) {
      throw new Error(`Unexpected error message: ${error.message}`);
    }
    return;
  }
  throw new Error('Expected a rejection, but the operation succeeded');
}

module.exports = { checkTrue, checkEqual, checkDeepEqual, checkThrows, checkRejects };
