const assert = require('node:assert/strict');
const { HttpException } = require('@nestjs/common');

// Validate every outcome before counting; never turn storage/runtime failures into HTTP results.
function assertSettledHttp(results, expected, label) {
  const unexpected = [];
  const counts = {};
  for (const [index, result] of results.entries()) {
    if (result.status !== 'rejected') {
      unexpected.push(new Error(`${label}[${index}]: unexpected fulfillment`));
    } else if (!(result.reason instanceof HttpException)) {
      unexpected.push(new Error(`${label}[${index}]: unexpected non-HTTP rejection`, { cause: result.reason }));
    } else {
      const status = result.reason.getStatus();
      if (!Object.hasOwn(expected, status)) {
        unexpected.push(new Error(`${label}[${index}]: unexpected HTTP status ${status}`, { cause: result.reason }));
      }
      counts[status] = (counts[status] ?? 0) + 1;
    }
  }
  if (unexpected.length) throw new AggregateError(unexpected, `${label}: unexpected concurrent outcomes`);
  for (const [status, count] of Object.entries(expected)) {
    assert.equal(counts[status] ?? 0, count, `${label}: HTTP ${status} count`);
  }
}
module.exports = { assertSettledHttp };
