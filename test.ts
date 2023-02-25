import assert from "assert";
import { indexPathEqual } from "./helper";

describe("indexPathEqual", function () {
  it("should return true for identical index paths", function () {
    const a = [1, 2, 3];
    const b = [1, 2, 3];
    assert.equal(indexPathEqual(a, b), true);
  });

  it("should return false for different index paths", function () {
    const a = [1, 2, 3];
    const b = [1, 2, 4];
    assert.equal(indexPathEqual(a, b), false);
  });

  it("should return false for index paths of different lengths", function () {
    const a = [1, 2, 3];
    const b = [1, 2];
    assert.equal(indexPathEqual(a, b), false);
  });
});
