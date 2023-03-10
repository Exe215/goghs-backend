export type GoghsProgram = {
  version: "0.1.0";
  name: "goghs_program";
  instructions: [
    {
      name: "create";
      accounts: [
        {
          name: "receipt";
          isMut: true;
          isSigner: false;
        },
        {
          name: "credits";
          isMut: true;
          isSigner: false;
        },
        {
          name: "nftTokenAccount";
          isMut: false;
          isSigner: false;
        },
        {
          name: "nftMint";
          isMut: false;
          isSigner: false;
        },
        {
          name: "nftMetadataAccount";
          isMut: false;
          isSigner: false;
        },
        {
          name: "nftMasterEdition";
          isMut: false;
          isSigner: false;
        },
        {
          name: "user";
          isMut: true;
          isSigner: true;
        },
        {
          name: "toAccount";
          isMut: true;
          isSigner: false;
        },
        {
          name: "systemProgram";
          isMut: false;
          isSigner: false;
        },
        {
          name: "metadataProgram";
          isMut: false;
          isSigner: false;
        }
      ];
      args: [
        {
          name: "path";
          type: {
            vec: "u16";
          };
        }
      ];
    },
    {
      name: "initializeCredits";
      accounts: [
        {
          name: "credits";
          isMut: true;
          isSigner: false;
        },
        {
          name: "nftTokenAccount";
          isMut: false;
          isSigner: false;
        },
        {
          name: "nftMint";
          isMut: false;
          isSigner: false;
        },
        {
          name: "nftMetadataAccount";
          isMut: false;
          isSigner: false;
        },
        {
          name: "nftMasterEdition";
          isMut: false;
          isSigner: false;
        },
        {
          name: "user";
          isMut: true;
          isSigner: true;
        },
        {
          name: "systemProgram";
          isMut: false;
          isSigner: false;
        },
        {
          name: "metadataProgram";
          isMut: false;
          isSigner: false;
        }
      ];
      args: [];
    },
    {
      name: "addCredits";
      accounts: [
        {
          name: "credits";
          isMut: true;
          isSigner: false;
        },
        {
          name: "nftMint";
          isMut: false;
          isSigner: false;
        },
        {
          name: "user";
          isMut: true;
          isSigner: true;
        }
      ];
      args: [];
    },
    {
      name: "startProcess";
      accounts: [
        {
          name: "receipt";
          isMut: true;
          isSigner: false;
        },
        {
          name: "nftMint";
          isMut: false;
          isSigner: false;
        },
        {
          name: "backend";
          isMut: false;
          isSigner: true;
        },
        {
          name: "user";
          isMut: false;
          isSigner: false;
        }
      ];
      args: [];
    },
    {
      name: "close";
      accounts: [
        {
          name: "receipt";
          isMut: true;
          isSigner: false;
        },
        {
          name: "nftMint";
          isMut: false;
          isSigner: false;
        },
        {
          name: "credits";
          isMut: true;
          isSigner: false;
        },
        {
          name: "user";
          isMut: true;
          isSigner: false;
        },
        {
          name: "backend";
          isMut: true;
          isSigner: true;
        },
        {
          name: "systemProgram";
          isMut: false;
          isSigner: false;
        }
      ];
      args: [
        {
          name: "succeeded";
          type: "bool";
        }
      ];
    }
  ];
  accounts: [
    {
      name: "receiptState";
      type: {
        kind: "struct";
        fields: [
          {
            name: "time";
            type: "i64";
          },
          {
            name: "inProgress";
            type: "bool";
          },
          {
            name: "indexPath";
            type: {
              vec: "u16";
            };
          },
          {
            name: "paymentType";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "creditsState";
      type: {
        kind: "struct";
        fields: [
          {
            name: "isInitialized";
            type: "bool";
          },
          {
            name: "credits";
            type: "u16";
          }
        ];
      };
    }
  ];
  errors: [
    {
      code: 6000;
      name: "MasterEditionNotInitialized";
      msg: "MasterEdition not initialized";
    },
    {
      code: 6001;
      name: "CreatorAddressMismatch";
      msg: "Creator addresses does not match";
    },
    {
      code: 6002;
      name: "CreatorNotVerified";
      msg: "Creator is not verified";
    },
    {
      code: 6003;
      name: "MasterEditionKeyMismatch";
      msg: "MasterEdition is not Valid";
    },
    {
      code: 6004;
      name: "NoCreators";
      msg: "No valid creators";
    }
  ];
};

export const IDL: GoghsProgram = {
  version: "0.1.0",
  name: "goghs_program",
  instructions: [
    {
      name: "create",
      accounts: [
        {
          name: "receipt",
          isMut: true,
          isSigner: false,
        },
        {
          name: "credits",
          isMut: true,
          isSigner: false,
        },
        {
          name: "nftTokenAccount",
          isMut: false,
          isSigner: false,
        },
        {
          name: "nftMint",
          isMut: false,
          isSigner: false,
        },
        {
          name: "nftMetadataAccount",
          isMut: false,
          isSigner: false,
        },
        {
          name: "nftMasterEdition",
          isMut: false,
          isSigner: false,
        },
        {
          name: "user",
          isMut: true,
          isSigner: true,
        },
        {
          name: "toAccount",
          isMut: true,
          isSigner: false,
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false,
        },
        {
          name: "metadataProgram",
          isMut: false,
          isSigner: false,
        },
      ],
      args: [
        {
          name: "path",
          type: {
            vec: "u16",
          },
        },
      ],
    },
    {
      name: "initializeCredits",
      accounts: [
        {
          name: "credits",
          isMut: true,
          isSigner: false,
        },
        {
          name: "nftTokenAccount",
          isMut: false,
          isSigner: false,
        },
        {
          name: "nftMint",
          isMut: false,
          isSigner: false,
        },
        {
          name: "nftMetadataAccount",
          isMut: false,
          isSigner: false,
        },
        {
          name: "nftMasterEdition",
          isMut: false,
          isSigner: false,
        },
        {
          name: "user",
          isMut: true,
          isSigner: true,
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false,
        },
        {
          name: "metadataProgram",
          isMut: false,
          isSigner: false,
        },
      ],
      args: [],
    },
    {
      name: "addCredits",
      accounts: [
        {
          name: "credits",
          isMut: true,
          isSigner: false,
        },
        {
          name: "nftMint",
          isMut: false,
          isSigner: false,
        },
        {
          name: "user",
          isMut: true,
          isSigner: true,
        },
      ],
      args: [],
    },
    {
      name: "startProcess",
      accounts: [
        {
          name: "receipt",
          isMut: true,
          isSigner: false,
        },
        {
          name: "nftMint",
          isMut: false,
          isSigner: false,
        },
        {
          name: "backend",
          isMut: false,
          isSigner: true,
        },
        {
          name: "user",
          isMut: false,
          isSigner: false,
        },
      ],
      args: [],
    },
    {
      name: "close",
      accounts: [
        {
          name: "receipt",
          isMut: true,
          isSigner: false,
        },
        {
          name: "nftMint",
          isMut: false,
          isSigner: false,
        },
        {
          name: "credits",
          isMut: true,
          isSigner: false,
        },
        {
          name: "user",
          isMut: true,
          isSigner: false,
        },
        {
          name: "backend",
          isMut: true,
          isSigner: true,
        },
        {
          name: "systemProgram",
          isMut: false,
          isSigner: false,
        },
      ],
      args: [
        {
          name: "succeeded",
          type: "bool",
        },
      ],
    },
  ],
  accounts: [
    {
      name: "receiptState",
      type: {
        kind: "struct",
        fields: [
          {
            name: "time",
            type: "i64",
          },
          {
            name: "inProgress",
            type: "bool",
          },
          {
            name: "indexPath",
            type: {
              vec: "u16",
            },
          },
          {
            name: "paymentType",
            type: "u8",
          },
        ],
      },
    },
    {
      name: "creditsState",
      type: {
        kind: "struct",
        fields: [
          {
            name: "isInitialized",
            type: "bool",
          },
          {
            name: "credits",
            type: "u16",
          },
        ],
      },
    },
  ],
  errors: [
    {
      code: 6000,
      name: "MasterEditionNotInitialized",
      msg: "MasterEdition not initialized",
    },
    {
      code: 6001,
      name: "CreatorAddressMismatch",
      msg: "Creator addresses does not match",
    },
    {
      code: 6002,
      name: "CreatorNotVerified",
      msg: "Creator is not verified",
    },
    {
      code: 6003,
      name: "MasterEditionKeyMismatch",
      msg: "MasterEdition is not Valid",
    },
    {
      code: 6004,
      name: "NoCreators",
      msg: "No valid creators",
    },
  ],
};
