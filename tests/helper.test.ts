import { expect } from "chai";
import { dateToString, getVariationAtPath, indexPathEqual } from "../helper";

describe("indexPathEqual", () => {
  it("should return true for identical index paths", function () {
    const a = [1, 2, 3];
    const b = [1, 2, 3];
    expect(indexPathEqual(a, b)).to.equal(true);
  });

  it("should return false for different index paths", function () {
    const a = [1, 2, 3];
    const b = [1, 2, 4];
    expect(indexPathEqual(a, b)).to.equal(false);
  });

  it("should return false for index paths of different lengths", function () {
    const a = [1, 2, 3];
    const b = [1, 2];
    expect(indexPathEqual(a, b)).to.equal(false);
  });
});

describe("getVariationAtPath", () => {
  const mockHistory = {
    focusIndex: 2,
    visiblePath: [0, 1, 0],
    favorites: [],
    baseImages: [
      {
        url: "https://arweave.net/reMWXsuHHA6FSkqSyU011Fh_u_wUXVZiQOCeqtMg39Q?ext=png",
        created: "2023-02-25 15:01.13",
        variations: [
          {
            url: "https://arweave.net/k2Sm06Ih-ha1mEBCBvA-jzZ-kGBj3q5B2HeW1yarQbg",
            created: "2023-02-25 15:01.13",
            variations: [],
          },
          {
            url: "https://arweave.net/2W69kX73UQpeHjGrTKT6uwoZ-Y6vj0AKQKuOjsU68VQ",
            created: "2023-02-25 15:01.49",
            variations: [
              {
                url: "https://arweave.net/A6dnpaTswrdS8kt5P13k0dQga_4EaR1c722AWmtu9_A",
                created: "2023-02-25 15:04.10",
                variations: [],
              },
            ],
          },
        ],
      },
    ],
  };

  it("should get the variation path", () => {
    const indexPath = [0, 1, 0];
    const variationPath = getVariationAtPath(mockHistory, indexPath);
    expect(variationPath?.url).to.equal(
      "https://arweave.net/A6dnpaTswrdS8kt5P13k0dQga_4EaR1c722AWmtu9_A"
    );
  });

  it("should return null if index path is undefined", () => {
    expect(getVariationAtPath(mockHistory, undefined as any)).to.be.null;
  });
});

describe("dateToString", () => {
  it("should return date as formatted string <yyyy-mm-dd hh:mm.ss>", () => {
    const GOGHS_BIRTHDAY = "1853-03-30T11:00:00.000Z";
    const date = new Date(GOGHS_BIRTHDAY);
    expect(dateToString(date)).to.equal("1853-03-30 11:00.00");
  });
});
