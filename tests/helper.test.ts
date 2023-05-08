import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { expect } from "chai";
import { GoghsProgram } from "../goghs_program";
import {
  dateToString,
  getImageBufferFromUrl,
  getProgramAccounts,
  getReceiptData,
  getVariationAtPath,
  indexPathEqual,
} from "../helper";
import { ReceiptData } from "../types/program";

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
    coverPath: [0, 1, 0],
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

describe("getProgramAccounts", () => {
  const nftAddress = new PublicKey(
    "DCLMpevATuGRf5Z5SANVqiSnsmC8q7vL4a9vQRGDiAvy"
  );
  const userAddress = new PublicKey(
    "C2roLLYGtyTbEs9V5576gqHN6zH8VnArT6vxoF9cfruu"
  );
  const programId = new PublicKey(
    "3FuKunkB8zMpFeFKDycDNE7q9ir6Rr1JtE6Wve9vv9UY"
  );

  it("returns receipt and credits PDAs", () => {
    const result = getProgramAccounts(nftAddress, userAddress, programId);
    expect(result).to.be.an("object");
    expect(result.receiptPda).to.be.an.instanceOf(PublicKey);
    expect(result.creditsPda).to.be.an.instanceOf(PublicKey);
  });

  it("returns correct receipt PDA", () => {
    const expectedReceiptPda = new PublicKey(
      "d4MPcyU1ef5UT6uUzdzAM8DwH12e1wc5K543tEsZHhp"
    );
    const result = getProgramAccounts(nftAddress, userAddress, programId);
    expect(result.receiptPda.toString()).to.equal(
      expectedReceiptPda.toString()
    );
  });

  it("returns correct credits PDA", () => {
    const expectedCreditsPda = new PublicKey(
      "CvZGXjXtaNWokpUMhKNgk2ds8YqHpgbDRNhzFBi9SjPb"
    );
    const result = getProgramAccounts(nftAddress, userAddress, programId);
    expect(result.creditsPda.toString()).to.equal(
      expectedCreditsPda.toString()
    );
  });
});

describe("getImageBufferFromUrl", () => {
  const mockUrl = "https://example.com/image.png";
  const mockName = "example-image";

  before(() => {
    // Mock the axios.get method to return a mock image buffer
    axios.get = async <T = any, R = AxiosResponse<T>>(url: string) => {
      return { data: Buffer.from("mock-image-buffer", "utf-8") } as R;
    };
  });

  it("should return a File object with the correct name", async () => {
    const expectedFileName = `${mockName}.png`;
    const file = await getImageBufferFromUrl(mockUrl, mockName);

    // defined as file because metaplex expects it
    // buffer has no name attribute
    expect(file).to.be.an.instanceOf(Buffer);
    expect(file.name).to.equal(expectedFileName);
  });
});
