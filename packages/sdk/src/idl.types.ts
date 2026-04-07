/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/swarmhaul.json`.
 */
export type Swarmhaul = {
  "address": "GW9wYUcfa6LT5vxJ12aN7nu8VxWVrM53jaZcrZak41sg",
  "metadata": {
    "name": "swarmhaul",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "assignLeg",
      "discriminator": [
        185,
        118,
        31,
        201,
        122,
        119,
        72,
        138
      ],
      "accounts": [
        {
          "name": "coordinator",
          "writable": true,
          "signer": true
        },
        {
          "name": "packageAccount"
        },
        {
          "name": "swarmAccount",
          "writable": true
        },
        {
          "name": "legAccount",
          "writable": true
        },
        {
          "name": "courierReputation",
          "docs": [
            "Reputation PDA for the courier being assigned.",
            "Created on first assignment, mutated to bump legs_accepted."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  112,
                  117,
                  116,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "courier"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "legIndex",
          "type": "u8"
        },
        {
          "name": "courier",
          "type": "pubkey"
        },
        {
          "name": "paymentLamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "cancelPackage",
      "discriminator": [
        138,
        119,
        179,
        242,
        67,
        111,
        90,
        203
      ],
      "accounts": [
        {
          "name": "shipper",
          "writable": true,
          "signer": true
        },
        {
          "name": "packageAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "packageAccount"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "confirmLeg",
      "discriminator": [
        20,
        162,
        162,
        208,
        74,
        135,
        57,
        95
      ],
      "accounts": [
        {
          "name": "courier",
          "writable": true,
          "signer": true
        },
        {
          "name": "legAccount",
          "writable": true
        },
        {
          "name": "swarmAccount",
          "writable": true
        },
        {
          "name": "packageAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "packageAccount"
              }
            ]
          }
        },
        {
          "name": "courierReputation",
          "docs": [
            "Reputation PDA for the courier — must match the leg's bound courier (signer).",
            "Mutated to bump legs_completed and recompute reliability_score.",
            "Created on first assignment in assign_leg, so it always exists by confirm_leg time."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  112,
                  117,
                  116,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "courier"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "formSwarm",
      "discriminator": [
        72,
        177,
        48,
        194,
        232,
        85,
        49,
        67
      ],
      "accounts": [
        {
          "name": "coordinator",
          "writable": true,
          "signer": true
        },
        {
          "name": "packageAccount",
          "writable": true
        },
        {
          "name": "swarmAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  97,
                  114,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "packageAccount"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "totalLegs",
          "type": "u8"
        },
        {
          "name": "totalLamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "listPackage",
      "discriminator": [
        212,
        125,
        69,
        31,
        90,
        126,
        173,
        8
      ],
      "accounts": [
        {
          "name": "shipper",
          "writable": true,
          "signer": true
        },
        {
          "name": "packageAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  99,
                  107,
                  97,
                  103,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "packageId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "via PDA-signed CPI in confirm_leg / settle / cancel_package."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "packageAccount"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "packageId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        },
        {
          "name": "maxBudgetLamports",
          "type": "u64"
        },
        {
          "name": "coordinator",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "registerVehicle",
      "discriminator": [
        249,
        150,
        162,
        65,
        231,
        141,
        147,
        105
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "vehicleProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  104,
                  105,
                  99,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "hourlyRateLamports",
          "type": "u64"
        },
        {
          "name": "bootVolumeLitres",
          "type": "u16"
        },
        {
          "name": "isAutonomous",
          "type": "bool"
        }
      ]
    },
    {
      "name": "settle",
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "coordinator",
          "writable": true,
          "signer": true
        },
        {
          "name": "swarmAccount",
          "writable": true
        },
        {
          "name": "packageAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "packageAccount"
              }
            ]
          }
        },
        {
          "name": "shipper",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "agentReputationAccount",
      "discriminator": [
        145,
        238,
        141,
        55,
        126,
        96,
        161,
        56
      ]
    },
    {
      "name": "legAccount",
      "discriminator": [
        47,
        123,
        191,
        151,
        181,
        225,
        159,
        32
      ]
    },
    {
      "name": "packageAccount",
      "discriminator": [
        180,
        2,
        252,
        204,
        29,
        23,
        200,
        44
      ]
    },
    {
      "name": "swarmAccount",
      "discriminator": [
        238,
        178,
        186,
        135,
        34,
        248,
        176,
        46
      ]
    },
    {
      "name": "vehicleProfileAccount",
      "discriminator": [
        142,
        128,
        241,
        39,
        43,
        13,
        78,
        233
      ]
    }
  ],
  "events": [
    {
      "name": "legAssigned",
      "discriminator": [
        158,
        248,
        160,
        106,
        77,
        225,
        103,
        219
      ]
    },
    {
      "name": "legConfirmed",
      "discriminator": [
        24,
        142,
        187,
        217,
        49,
        28,
        114,
        189
      ]
    },
    {
      "name": "packageCancelled",
      "discriminator": [
        196,
        161,
        158,
        137,
        20,
        174,
        247,
        93
      ]
    },
    {
      "name": "packageListed",
      "discriminator": [
        101,
        202,
        249,
        140,
        197,
        51,
        51,
        80
      ]
    },
    {
      "name": "swarmFormed",
      "discriminator": [
        191,
        11,
        168,
        84,
        166,
        137,
        183,
        10
      ]
    },
    {
      "name": "swarmSettled",
      "discriminator": [
        7,
        75,
        190,
        4,
        43,
        32,
        31,
        113
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "zeroBudget",
      "msg": "Budget must be greater than zero"
    }
  ],
  "types": [
    {
      "name": "agentReputationAccount",
      "docs": [
        "On-chain reputation for an autonomous agent.",
        "",
        "Mutated only by `assign_leg` (legs_accepted++) and `confirm_leg`",
        "(legs_completed++, total_delivery_time_sec += elapsed). There is no",
        "standalone `update_reputation` instruction — every counter movement",
        "is bound to a verified protocol action.",
        "",
        "`reliability_score` is computed on read as",
        "floor(legs_completed / legs_accepted * 100)",
        "and exposed as a stored field for cheap leaderboard queries.",
        "",
        "PDA seeds: [b\"reputation\", agent_pubkey]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "legsCompleted",
            "type": "u32"
          },
          {
            "name": "legsAccepted",
            "type": "u32"
          },
          {
            "name": "totalDeliveryTimeSec",
            "type": "u64"
          },
          {
            "name": "reliabilityScore",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "legAccount",
      "docs": [
        "Per-leg state, created by the coordinator via `assign_leg`.",
        "",
        "Binds a specific courier pubkey to a specific leg of a specific swarm",
        "with a fixed payment amount, eliminating the prior class of vault-drain",
        "attacks where any signer could call confirm_leg unbounded times.",
        "",
        "PDA seeds: [b\"leg\", swarm_pubkey, &[leg_index]]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "swarm",
            "type": "pubkey"
          },
          {
            "name": "legIndex",
            "type": "u8"
          },
          {
            "name": "courier",
            "type": "pubkey"
          },
          {
            "name": "paymentLamports",
            "type": "u64"
          },
          {
            "name": "confirmed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "legAssigned",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "swarm",
            "type": "pubkey"
          },
          {
            "name": "leg",
            "type": "pubkey"
          },
          {
            "name": "legIndex",
            "type": "u8"
          },
          {
            "name": "courier",
            "type": "pubkey"
          },
          {
            "name": "paymentLamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "legConfirmed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "swarm",
            "type": "pubkey"
          },
          {
            "name": "leg",
            "type": "pubkey"
          },
          {
            "name": "courier",
            "type": "pubkey"
          },
          {
            "name": "paymentLamports",
            "type": "u64"
          },
          {
            "name": "completedLegs",
            "type": "u8"
          },
          {
            "name": "totalLegs",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "packageAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "shipper",
            "type": "pubkey"
          },
          {
            "name": "coordinator",
            "docs": [
              "Authority that can form/assign/settle the swarm on behalf of the shipper.",
              "Set at list_package time. May be the shipper themselves or a trusted protocol coordinator."
            ],
            "type": "pubkey"
          },
          {
            "name": "packageId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "maxBudgetLamports",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "packageStatus"
              }
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "vaultBump",
            "docs": [
              "PDA bump for the escrow vault, stored to prevent recomputation drift across instructions."
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "packageCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "package",
            "type": "pubkey"
          },
          {
            "name": "refundedLamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "packageListed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "package",
            "type": "pubkey"
          },
          {
            "name": "shipper",
            "type": "pubkey"
          },
          {
            "name": "coordinator",
            "type": "pubkey"
          },
          {
            "name": "maxBudgetLamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "packageStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "listed"
          },
          {
            "name": "swarmForming"
          },
          {
            "name": "inTransit"
          },
          {
            "name": "delivered"
          },
          {
            "name": "failed"
          }
        ]
      }
    },
    {
      "name": "swarmAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "package",
            "type": "pubkey"
          },
          {
            "name": "totalLegs",
            "type": "u8"
          },
          {
            "name": "assignedLegs",
            "docs": [
              "Number of LegAccount PDAs that have been assigned (matches total_legs once Active)."
            ],
            "type": "u8"
          },
          {
            "name": "completedLegs",
            "type": "u8"
          },
          {
            "name": "totalLamports",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "swarmStatus"
              }
            }
          },
          {
            "name": "formedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "swarmFormed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "swarm",
            "type": "pubkey"
          },
          {
            "name": "package",
            "type": "pubkey"
          },
          {
            "name": "coordinator",
            "type": "pubkey"
          },
          {
            "name": "totalLegs",
            "type": "u8"
          },
          {
            "name": "totalLamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "swarmSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "swarm",
            "type": "pubkey"
          },
          {
            "name": "package",
            "type": "pubkey"
          },
          {
            "name": "surplusReturnedLamports",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "swarmStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "forming"
          },
          {
            "name": "active"
          },
          {
            "name": "settled"
          },
          {
            "name": "failed"
          }
        ]
      }
    },
    {
      "name": "vehicleProfileAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "hourlyRateLamports",
            "type": "u64"
          },
          {
            "name": "bootVolumeLitres",
            "type": "u16"
          },
          {
            "name": "isAutonomous",
            "type": "bool"
          },
          {
            "name": "registeredAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
