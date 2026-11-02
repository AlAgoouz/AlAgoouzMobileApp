begin;
create schema if not exists extensions;
create extension if not exists pg_jsonschema with schema extensions;

create or replace function bon_erp_private.valid_date(value text) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  return value ~ '^\d{4}-\d{2}-\d{2}$' and to_char(value::date,'YYYY-MM-DD')=value;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end $$;

create or replace function bon_erp_private.base_quantity(q numeric,u text,b text) returns numeric
language sql immutable set search_path='' as $$
  select case when u=b then q when (u='gram' and b='kg') or (u='ml' and b='liter') then q/1000 else null end
$$;

create or replace function bon_erp_private.validate_payload(s jsonb) returns void
language plpgsql set search_path='' as $$
declare
-- BEGIN GENERATED SCHEMA
  v_schema jsonb := $schema${
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "code": {
            "type": "string",
            "minLength": 1
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "category": {
            "type": "string",
            "enum": [
              "raw_bean",
              "raw_spice",
              "manufactured_blend",
              "drink_recipe",
              "direct_product"
            ]
          },
          "baseUnit": {
            "type": "string",
            "enum": [
              "kg",
              "piece",
              "liter"
            ]
          },
          "openingStock": {
            "type": "number",
            "minimum": 0
          },
          "stock": {
            "type": "number",
            "minimum": 0
          },
          "minStock": {
            "type": "number",
            "minimum": 0
          },
          "costPrice": {
            "type": "number",
            "minimum": 0
          },
          "lastPurchasePrice": {
            "type": "number",
            "minimum": 0
          },
          "retailPrice": {
            "type": "number",
            "minimum": 0
          },
          "wholesalePrice": {
            "type": "number",
            "minimum": 0
          },
          "canSellDirectly": {
            "type": "boolean"
          },
          "hasRecipe": {
            "type": "boolean"
          },
          "recipe": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "ingredientId": {
                  "type": "string",
                  "minLength": 1
                },
                "ingredientName": {
                  "type": "string"
                },
                "quantity": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "unit": {
                  "type": "string",
                  "enum": [
                    "kg",
                    "gram",
                    "piece",
                    "liter",
                    "ml"
                  ]
                }
              },
              "required": [
                "ingredientId",
                "ingredientName",
                "quantity",
                "unit"
              ],
              "additionalProperties": false
            }
          },
          "supplierPrices": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "supplierId": {
                  "type": "string",
                  "minLength": 1
                },
                "supplierName": {
                  "type": "string"
                },
                "price": {
                  "type": "number",
                  "minimum": 0
                },
                "date": {
                  "type": "string"
                }
              },
              "required": [
                "supplierId",
                "supplierName",
                "price",
                "date"
              ],
              "additionalProperties": {}
            }
          }
        },
        "required": [
          "id",
          "code",
          "name",
          "category",
          "baseUnit",
          "stock",
          "minStock",
          "costPrice",
          "lastPurchasePrice",
          "retailPrice",
          "wholesalePrice",
          "canSellDirectly",
          "hasRecipe",
          "supplierPrices"
        ],
        "additionalProperties": {}
      }
    },
    "production_batches": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "batchNumber": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "blendId": {
            "type": "string",
            "minLength": 1
          },
          "blendName": {
            "type": "string"
          },
          "quantityProducedKg": {
            "type": "number",
            "minimum": 0
          },
          "unitCostPerKg": {
            "type": "number",
            "minimum": 0
          },
          "totalBatchCost": {
            "type": "number",
            "minimum": 0
          },
          "partnerName": {
            "type": "string"
          },
          "ingredientsConsumed": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "ingredientId": {
                  "type": "string",
                  "minLength": 1
                },
                "ingredientName": {
                  "type": "string"
                },
                "quantityUsed": {
                  "type": "number",
                  "minimum": 0
                },
                "displayQuantity": {
                  "type": "string"
                },
                "cost": {
                  "type": "number",
                  "minimum": 0
                }
              },
              "required": [
                "ingredientId",
                "ingredientName",
                "quantityUsed",
                "displayQuantity",
                "cost"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "id",
          "batchNumber",
          "date",
          "blendId",
          "blendName",
          "quantityProducedKg",
          "unitCostPerKg",
          "totalBatchCost",
          "partnerName",
          "ingredientsConsumed"
        ],
        "additionalProperties": {}
      }
    },
    "purchase_invoices": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "invoiceNumber": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "totalAmount": {
            "type": "number",
            "minimum": 0
          },
          "paidAmount": {
            "type": "number",
            "minimum": 0
          },
          "remainingAmount": {
            "type": "number",
            "minimum": 0
          },
          "partnerName": {
            "type": "string"
          },
          "isCancelled": {
            "type": "boolean"
          },
          "cancelledAt": {
            "type": "string"
          },
          "cancelledBy": {
            "type": "string"
          },
          "refundDue": {
            "type": "number",
            "minimum": 0
          },
          "supplierId": {
            "type": "string",
            "minLength": 1
          },
          "paymentMethod": {
            "type": "string",
            "enum": [
              "نقدي",
              "آجل",
              "جزئي"
            ]
          },
          "supplierName": {
            "type": "string"
          },
          "inventoryBefore": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "code": {
                  "type": "string",
                  "minLength": 1
                },
                "name": {
                  "type": "string",
                  "minLength": 1
                },
                "category": {
                  "type": "string",
                  "enum": [
                    "raw_bean",
                    "raw_spice",
                    "manufactured_blend",
                    "drink_recipe",
                    "direct_product"
                  ]
                },
                "baseUnit": {
                  "type": "string",
                  "enum": [
                    "kg",
                    "piece",
                    "liter"
                  ]
                },
                "openingStock": {
                  "type": "number",
                  "minimum": 0
                },
                "stock": {
                  "type": "number",
                  "minimum": 0
                },
                "minStock": {
                  "type": "number",
                  "minimum": 0
                },
                "costPrice": {
                  "type": "number",
                  "minimum": 0
                },
                "lastPurchasePrice": {
                  "type": "number",
                  "minimum": 0
                },
                "retailPrice": {
                  "type": "number",
                  "minimum": 0
                },
                "wholesalePrice": {
                  "type": "number",
                  "minimum": 0
                },
                "canSellDirectly": {
                  "type": "boolean"
                },
                "hasRecipe": {
                  "type": "boolean"
                },
                "recipe": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "ingredientId": {
                        "type": "string",
                        "minLength": 1
                      },
                      "ingredientName": {
                        "type": "string"
                      },
                      "quantity": {
                        "type": "number",
                        "exclusiveMinimum": 0
                      },
                      "unit": {
                        "type": "string",
                        "enum": [
                          "kg",
                          "gram",
                          "piece",
                          "liter",
                          "ml"
                        ]
                      }
                    },
                    "required": [
                      "ingredientId",
                      "ingredientName",
                      "quantity",
                      "unit"
                    ],
                    "additionalProperties": false
                  }
                },
                "supplierPrices": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "supplierId": {
                        "type": "string",
                        "minLength": 1
                      },
                      "supplierName": {
                        "type": "string"
                      },
                      "price": {
                        "type": "number",
                        "minimum": 0
                      },
                      "date": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "supplierId",
                      "supplierName",
                      "price",
                      "date"
                    ],
                    "additionalProperties": {}
                  }
                }
              },
              "required": [
                "id",
                "code",
                "name",
                "category",
                "baseUnit",
                "stock",
                "minStock",
                "costPrice",
                "lastPurchasePrice",
                "retailPrice",
                "wholesalePrice",
                "canSellDirectly",
                "hasRecipe",
                "supplierPrices"
              ],
              "additionalProperties": {}
            }
          },
          "inventoryAfter": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "minLength": 1
                },
                "code": {
                  "type": "string",
                  "minLength": 1
                },
                "name": {
                  "type": "string",
                  "minLength": 1
                },
                "category": {
                  "type": "string",
                  "enum": [
                    "raw_bean",
                    "raw_spice",
                    "manufactured_blend",
                    "drink_recipe",
                    "direct_product"
                  ]
                },
                "baseUnit": {
                  "type": "string",
                  "enum": [
                    "kg",
                    "piece",
                    "liter"
                  ]
                },
                "openingStock": {
                  "type": "number",
                  "minimum": 0
                },
                "stock": {
                  "type": "number",
                  "minimum": 0
                },
                "minStock": {
                  "type": "number",
                  "minimum": 0
                },
                "costPrice": {
                  "type": "number",
                  "minimum": 0
                },
                "lastPurchasePrice": {
                  "type": "number",
                  "minimum": 0
                },
                "retailPrice": {
                  "type": "number",
                  "minimum": 0
                },
                "wholesalePrice": {
                  "type": "number",
                  "minimum": 0
                },
                "canSellDirectly": {
                  "type": "boolean"
                },
                "hasRecipe": {
                  "type": "boolean"
                },
                "recipe": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "ingredientId": {
                        "type": "string",
                        "minLength": 1
                      },
                      "ingredientName": {
                        "type": "string"
                      },
                      "quantity": {
                        "type": "number",
                        "exclusiveMinimum": 0
                      },
                      "unit": {
                        "type": "string",
                        "enum": [
                          "kg",
                          "gram",
                          "piece",
                          "liter",
                          "ml"
                        ]
                      }
                    },
                    "required": [
                      "ingredientId",
                      "ingredientName",
                      "quantity",
                      "unit"
                    ],
                    "additionalProperties": false
                  }
                },
                "supplierPrices": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "supplierId": {
                        "type": "string",
                        "minLength": 1
                      },
                      "supplierName": {
                        "type": "string"
                      },
                      "price": {
                        "type": "number",
                        "minimum": 0
                      },
                      "date": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "supplierId",
                      "supplierName",
                      "price",
                      "date"
                    ],
                    "additionalProperties": {}
                  }
                }
              },
              "required": [
                "id",
                "code",
                "name",
                "category",
                "baseUnit",
                "stock",
                "minStock",
                "costPrice",
                "lastPurchasePrice",
                "retailPrice",
                "wholesalePrice",
                "canSellDirectly",
                "hasRecipe",
                "supplierPrices"
              ],
              "additionalProperties": {}
            }
          },
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "itemId": {
                  "type": "string",
                  "minLength": 1
                },
                "itemName": {
                  "type": "string"
                },
                "quantity": {
                  "type": "number",
                  "minimum": 0
                },
                "purchasePrice": {
                  "type": "number",
                  "minimum": 0
                },
                "updateProductCost": {
                  "type": "boolean"
                }
              },
              "required": [
                "itemId",
                "itemName",
                "quantity",
                "purchasePrice",
                "updateProductCost"
              ],
              "additionalProperties": {}
            }
          }
        },
        "required": [
          "id",
          "invoiceNumber",
          "date",
          "totalAmount",
          "paidAmount",
          "remainingAmount",
          "partnerName",
          "supplierId",
          "paymentMethod",
          "supplierName",
          "items"
        ],
        "additionalProperties": {}
      }
    },
    "sales_invoices": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "invoiceNumber": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "totalAmount": {
            "type": "number",
            "minimum": 0
          },
          "paidAmount": {
            "type": "number",
            "minimum": 0
          },
          "remainingAmount": {
            "type": "number",
            "minimum": 0
          },
          "partnerName": {
            "type": "string"
          },
          "isCancelled": {
            "type": "boolean"
          },
          "cancelledAt": {
            "type": "string"
          },
          "cancelledBy": {
            "type": "string"
          },
          "refundDue": {
            "type": "number",
            "minimum": 0
          },
          "saleType": {
            "type": "string",
            "enum": [
              "retail",
              "wholesale",
              "cashier_sync"
            ]
          },
          "paymentMethod": {
            "type": "string",
            "enum": [
              "نقدي",
              "آجل",
              "محفظة/انستا باي"
            ]
          },
          "customerName": {
            "type": "string"
          },
          "isReturned": {
            "type": "boolean"
          },
          "returnedAt": {
            "type": "string"
          },
          "returnedBy": {
            "type": "string"
          },
          "returnDebtReversed": {
            "type": "number",
            "minimum": 0
          },
          "returnRefundAmount": {
            "type": "number",
            "minimum": 0
          },
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "itemId": {
                  "type": "string",
                  "minLength": 1
                },
                "itemName": {
                  "type": "string"
                },
                "category": {
                  "type": "string",
                  "enum": [
                    "raw_bean",
                    "raw_spice",
                    "manufactured_blend",
                    "drink_recipe",
                    "direct_product"
                  ]
                },
                "quantity": {
                  "type": "number",
                  "minimum": 0
                },
                "normalizedQtyInBaseUnit": {
                  "type": "number",
                  "minimum": 0
                },
                "totalPrice": {
                  "type": "number",
                  "minimum": 0
                },
                "totalCost": {
                  "type": "number",
                  "minimum": 0
                },
                "unitCost": {
                  "type": "number",
                  "minimum": 0
                },
                "unitPrice": {
                  "type": "number",
                  "minimum": 0
                },
                "profit": {
                  "type": "number"
                }
              },
              "required": [
                "itemId",
                "itemName",
                "category",
                "quantity",
                "normalizedQtyInBaseUnit",
                "totalPrice",
                "totalCost",
                "unitCost",
                "unitPrice",
                "profit"
              ],
              "additionalProperties": {}
            }
          },
          "subtotal": {
            "type": "number",
            "minimum": 0
          },
          "discount": {
            "type": "number",
            "minimum": 0
          },
          "totalCost": {
            "type": "number",
            "minimum": 0
          },
          "netProfit": {
            "type": "number"
          }
        },
        "required": [
          "id",
          "invoiceNumber",
          "date",
          "totalAmount",
          "paidAmount",
          "remainingAmount",
          "partnerName",
          "saleType",
          "paymentMethod",
          "customerName",
          "items",
          "subtotal",
          "discount",
          "totalCost",
          "netProfit"
        ],
        "additionalProperties": {}
      }
    },
    "suppliers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "phone": {
            "type": "string"
          },
          "category": {
            "type": "string"
          },
          "balance": {
            "type": "number",
            "minimum": 0
          },
          "totalPurchases": {
            "type": "number",
            "minimum": 0
          },
          "invoicesCount": {
            "type": "number",
            "minimum": 0
          }
        },
        "required": [
          "id",
          "name",
          "phone",
          "category",
          "balance",
          "totalPurchases",
          "invoicesCount"
        ],
        "additionalProperties": {}
      }
    },
    "customers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "phone": {
            "type": "string"
          },
          "type": {
            "type": "string"
          },
          "balance": {
            "type": "number",
            "minimum": 0
          },
          "totalSales": {
            "type": "number",
            "minimum": 0
          },
          "invoicesCount": {
            "type": "number",
            "minimum": 0
          }
        },
        "required": [
          "id",
          "name",
          "phone",
          "type",
          "balance",
          "totalSales",
          "invoicesCount"
        ],
        "additionalProperties": {}
      }
    },
    "expenses": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "category": {
            "type": "string",
            "enum": [
              "إيجار",
              "كهرباء ومياه وغاز",
              "رواتب ويوميات",
              "صيانة مطاحن وماكينات",
              "أكياس وتغليف",
              "نقل ومشال",
              "مسحوبات شركاء",
              "نثريات أخرى"
            ]
          },
          "title": {
            "type": "string",
            "minLength": 1
          },
          "amount": {
            "type": "number",
            "minimum": 0
          },
          "partnerName": {
            "type": "string"
          },
          "paidFrom": {
            "type": "string",
            "enum": [
              "درج المحل",
              "خزنة الشركة",
              "من جيب الشريك",
              "تسوية مخزون (بدون نقدية)"
            ]
          },
          "partnerId": {
            "type": "string",
            "minLength": 1
          },
          "isCancelled": {
            "type": "boolean"
          },
          "cancelledAt": {
            "type": "string"
          },
          "cancelledBy": {
            "type": "string"
          },
          "sourceInvoiceId": {
            "type": "string",
            "minLength": 1
          },
          "sourceEmployeeTransactionId": {
            "type": "string",
            "minLength": 1
          }
        },
        "required": [
          "id",
          "date",
          "category",
          "title",
          "amount",
          "partnerName",
          "paidFrom"
        ],
        "additionalProperties": {}
      }
    },
    "partners": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "username": {
            "type": "string",
            "minLength": 1
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "role": {
            "type": "string"
          },
          "avatarLetter": {
            "type": "string"
          },
          "phone": {
            "type": "string"
          },
          "sharePercent": {
            "type": "number",
            "minimum": 0,
            "maximum": 100
          },
          "totalPaidFromPocket": {
            "type": "number",
            "minimum": 0
          },
          "totalWithdrawals": {
            "type": "number",
            "minimum": 0
          },
          "lastLogin": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "username",
          "name",
          "role",
          "avatarLetter",
          "phone",
          "sharePercent",
          "totalPaidFromPocket",
          "totalWithdrawals"
        ],
        "additionalProperties": false
      }
    },
    "audit_logs": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "timestamp": {
            "type": "string",
            "minLength": 1
          },
          "partnerName": {
            "type": "string"
          },
          "actionType": {
            "type": "string",
            "minLength": 1
          },
          "description": {
            "type": "string"
          },
          "amount": {
            "type": "number"
          },
          "actorId": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "timestamp",
          "partnerName",
          "actionType",
          "description"
        ],
        "additionalProperties": false
      }
    },
    "shifts": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "shiftName": {
            "type": "string"
          },
          "cashierName": {
            "type": "string"
          },
          "supervisorPartner": {
            "type": "string"
          },
          "openingCash": {
            "type": "number",
            "minimum": 0
          },
          "cashSales": {
            "type": "number",
            "minimum": 0
          },
          "expensesPaid": {
            "type": "number",
            "minimum": 0
          },
          "expectedCash": {
            "type": "number"
          },
          "actualCash": {
            "type": "number",
            "minimum": 0
          },
          "difference": {
            "type": "number"
          },
          "status": {
            "type": "string"
          }
        },
        "required": [
          "id",
          "date",
          "shiftName",
          "cashierName",
          "supervisorPartner",
          "openingCash",
          "cashSales",
          "expensesPaid",
          "expectedCash",
          "actualCash",
          "difference",
          "status"
        ],
        "additionalProperties": false
      }
    },
    "employees": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "role": {
            "type": "string"
          },
          "phone": {
            "type": "string"
          },
          "salaryType": {
            "type": "string",
            "enum": [
              "شهري",
              "يومية"
            ]
          },
          "baseMonthlySalary": {
            "type": "number",
            "minimum": 0
          },
          "dailyRate": {
            "type": "number",
            "minimum": 0
          },
          "workedDaysThisMonth": {
            "type": "number",
            "minimum": 0
          },
          "totalAdvances": {
            "type": "number",
            "minimum": 0
          },
          "totalDeductions": {
            "type": "number",
            "minimum": 0
          },
          "totalBonuses": {
            "type": "number",
            "minimum": 0
          },
          "totalPaidOut": {
            "type": "number",
            "minimum": 0
          },
          "payrollPeriod": {
            "type": "string",
            "pattern": "^\\d{4}-(0[1-9]|1[0-2])$"
          },
          "openingPayable": {
            "type": "number"
          }
        },
        "required": [
          "id",
          "name",
          "role",
          "phone",
          "salaryType",
          "baseMonthlySalary",
          "dailyRate",
          "workedDaysThisMonth",
          "totalAdvances",
          "totalDeductions",
          "totalBonuses",
          "totalPaidOut"
        ],
        "additionalProperties": false
      }
    },
    "employee_transactions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "employeeId": {
            "type": "string",
            "minLength": 1
          },
          "employeeName": {
            "type": "string"
          },
          "type": {
            "type": "string",
            "enum": [
              "سلفة",
              "حضور يومية",
              "خصم/عجز",
              "مكافأة",
              "صرف راتب",
              "إقفال شهر"
            ]
          },
          "amount": {
            "type": "number",
            "minimum": 0
          },
          "notes": {
            "type": "string"
          },
          "partnerName": {
            "type": "string"
          },
          "payrollPeriod": {
            "type": "string",
            "pattern": "^\\d{4}-(0[1-9]|1[0-2])$"
          },
          "accountingVersion": {
            "type": "number",
            "const": 1
          },
          "partnerId": {
            "type": "string",
            "minLength": 1
          },
          "paidFrom": {
            "type": "string",
            "enum": [
              "درج المحل",
              "خزنة الشركة",
              "من جيب الشريك"
            ]
          },
          "expenseId": {
            "type": "string",
            "minLength": 1
          },
          "reversedAt": {
            "type": "string"
          },
          "reversedBy": {
            "type": "string"
          },
          "closingSummary": {
            "type": "object",
            "properties": {
              "openingPayable": {
                "type": "number"
              },
              "earned": {
                "type": "number",
                "minimum": 0
              },
              "advances": {
                "type": "number",
                "minimum": 0
              },
              "deductions": {
                "type": "number",
                "minimum": 0
              },
              "bonuses": {
                "type": "number",
                "minimum": 0
              },
              "paidOut": {
                "type": "number",
                "minimum": 0
              },
              "carryForward": {
                "type": "number"
              }
            },
            "required": [
              "openingPayable",
              "earned",
              "advances",
              "deductions",
              "bonuses",
              "paidOut",
              "carryForward"
            ],
            "additionalProperties": false
          }
        },
        "required": [
          "id",
          "date",
          "employeeId",
          "employeeName",
          "type",
          "amount",
          "notes",
          "partnerName"
        ],
        "additionalProperties": false
      }
    },
    "stocktaking_records": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "auditNumber": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "partnerName": {
            "type": "string"
          },
          "totalShortageValue": {
            "type": "number",
            "minimum": 0
          },
          "totalSurplusValue": {
            "type": "number",
            "minimum": 0
          },
          "netVarianceValue": {
            "type": "number"
          },
          "itemsAudited": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "itemId": {
                  "type": "string",
                  "minLength": 1
                },
                "itemName": {
                  "type": "string"
                },
                "baseUnit": {
                  "type": "string"
                },
                "systemStock": {
                  "type": "number"
                },
                "actualStock": {
                  "type": "number",
                  "minimum": 0
                },
                "difference": {
                  "type": "number"
                },
                "unitCost": {
                  "type": "number",
                  "minimum": 0
                },
                "financialDifference": {
                  "type": "number"
                }
              },
              "required": [
                "itemId",
                "itemName",
                "baseUnit",
                "systemStock",
                "actualStock",
                "difference",
                "unitCost",
                "financialDifference"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "id",
          "auditNumber",
          "date",
          "partnerName",
          "totalShortageValue",
          "totalSurplusValue",
          "netVarianceValue",
          "itemsAudited"
        ],
        "additionalProperties": {}
      }
    },
    "account_payments": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "date": {
            "type": "string",
            "minLength": 1
          },
          "targetType": {
            "type": "string",
            "enum": [
              "supplier",
              "customer"
            ]
          },
          "targetId": {
            "type": "string",
            "minLength": 1
          },
          "targetName": {
            "type": "string"
          },
          "amount": {
            "type": "number",
            "minimum": 0
          },
          "partnerName": {
            "type": "string"
          },
          "notes": {
            "type": "string"
          },
          "reversedAt": {
            "type": "string"
          },
          "reversedBy": {
            "type": "string"
          },
          "allocations": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "invoiceId": {
                  "type": "string",
                  "minLength": 1
                },
                "amount": {
                  "type": "number",
                  "minimum": 0
                }
              },
              "required": [
                "invoiceId",
                "amount"
              ],
              "additionalProperties": false
            }
          },
          "openingBalanceAmount": {
            "type": "number",
            "minimum": 0
          }
        },
        "required": [
          "id",
          "date",
          "targetType",
          "targetId",
          "targetName",
          "amount",
          "partnerName"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "items",
    "production_batches",
    "purchase_invoices",
    "sales_invoices",
    "suppliers",
    "customers",
    "expenses",
    "partners",
    "audit_logs",
    "shifts",
    "employees",
    "employee_transactions",
    "stocktaking_records",
    "account_payments"
  ],
  "additionalProperties": false
}$schema$::jsonb;
-- END GENERATED SCHEMA
  f text; r jsonb; l jsonb; item jsonb; raw jsonb; linked jsonb;
  total numeric; costs numeric; qty numeric; period text;
begin
  if octet_length(s::text)>10485760 then raise exception 'STORE_TOO_LARGE' using errcode='22023'; end if;
  if not extensions.jsonb_matches_schema(v_schema::json,s) then raise exception 'INVALID_STORE_SCHEMA' using errcode='22023'; end if;
  if jsonb_path_exists(s,'$.**.password') then raise exception 'PLAINTEXT_PASSWORD_FORBIDDEN'; end if;
  for f in select jsonb_object_keys(s) loop
    if (select count(*) from jsonb_array_elements(s->f))<>(select count(distinct x->>'id') from jsonb_array_elements(s->f) x) then raise exception 'DUPLICATE_IDS: %',f; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(s->'items'))<>(select count(distinct upper(btrim(x->>'code'))) from jsonb_array_elements(s->'items') x) then raise exception 'DUPLICATE_ITEM_CODE'; end if;
  if jsonb_array_length(s->'partners')<1 or abs((select coalesce(sum((p->>'sharePercent')::numeric),0) from jsonb_array_elements(s->'partners') p)-100)>0.0001 then raise exception 'INVALID_PARTNER_SHARES'; end if;
  for item in select value from jsonb_array_elements(s->'items') loop
    if item->>'category'='manufactured_blend' and item->>'baseUnit'<>'kg' or item->>'category'='drink_recipe' and item->>'baseUnit'<>'piece' then raise exception 'INVALID_ITEM_UNIT'; end if;
    if (item->>'hasRecipe')::boolean and jsonb_array_length(coalesce(item->'recipe','[]'::jsonb))=0 then raise exception 'EMPTY_RECIPE'; end if;
    for l in select value from jsonb_array_elements(coalesce(item->'recipe','[]'::jsonb)) loop
      select x into raw from jsonb_array_elements(s->'items') x where x->>'id'=l->>'ingredientId';
      if raw is null or raw->>'id'=item->>'id' or raw->>'category'='drink_recipe' then raise exception 'INVALID_RECIPE_REFERENCE'; end if;
      if bon_erp_private.base_quantity((l->>'quantity')::numeric,l->>'unit',raw->>'baseUnit') is null then raise exception 'INVALID_RECIPE_UNIT'; end if;
    end loop;
  end loop;
  if exists(
    with recursive edges as (select i->>'id' src,recipe_row->>'ingredientId' dst from jsonb_array_elements(s->'items') i cross join lateral jsonb_array_elements(coalesce(i->'recipe','[]')) recipe_row),
    walk as (select src,dst,array[src,dst] path,src=dst cycle from edges union all select w.src,e.dst,w.path||e.dst,e.dst=any(w.path) from walk w join edges e on e.src=w.dst where not w.cycle and cardinality(w.path)<=50)
    select 1 from walk where cycle or cardinality(path)>50
  ) then raise exception 'RECIPE_CYCLE_OR_DEPTH'; end if;
  foreach f in array array['sales_invoices','purchase_invoices','production_batches','expenses','employee_transactions','account_payments','stocktaking_records','shifts'] loop
    for r in select value from jsonb_array_elements(s->f) loop
      if not bon_erp_private.valid_date(r->>'date') then raise exception 'INVALID_BUSINESS_DATE: %',f; end if;
    end loop;
  end loop;
  foreach f in array array['sales_invoices','purchase_invoices'] loop
    for r in select value from jsonb_array_elements(s->f) loop
      if abs((r->>'totalAmount')::numeric-(r->>'paidAmount')::numeric-(r->>'remainingAmount')::numeric)>0.011 then raise exception 'INVOICE_PAYMENT_MISMATCH'; end if;
      if jsonb_array_length(r->'items')=0 then raise exception 'EMPTY_INVOICE'; end if;
      total:=0; costs:=0;
      for l in select value from jsonb_array_elements(r->'items') loop
        select x into item from jsonb_array_elements(s->'items') x where x->>'id'=l->>'itemId';
        if item is null or (l->>'quantity')::numeric<=0 then raise exception 'INVALID_INVOICE_ITEM'; end if;
        if f='purchase_invoices' then
          if item->>'category' in ('manufactured_blend','drink_recipe') then raise exception 'PRODUCED_ITEM_NOT_PURCHASABLE'; end if;
          total:=total+round((l->>'quantity')::numeric*(l->>'purchasePrice')::numeric,2);
        else
          qty:=(l->>'normalizedQtyInBaseUnit')::numeric;
          if qty<=0 or l->>'category' not in ('raw_bean','raw_spice','manufactured_blend','drink_recipe','direct_product') then raise exception 'INVALID_SALES_QUANTITY'; end if;
          if abs((l->>'totalPrice')::numeric-round(qty*(l->>'unitPrice')::numeric,2))>0.011 or abs((l->>'totalCost')::numeric-round(qty*(l->>'unitCost')::numeric,2))>0.011 or abs((l->>'profit')::numeric-((l->>'totalPrice')::numeric-(l->>'totalCost')::numeric))>0.011 then raise exception 'SALES_LINE_MISMATCH'; end if;
          total:=total+(l->>'totalPrice')::numeric; costs:=costs+(l->>'totalCost')::numeric;
        end if;
      end loop;
      if f='purchase_invoices' then
        if not exists(select 1 from jsonb_array_elements(s->'suppliers') x where x->>'id'=r->>'supplierId') or abs(total-(r->>'totalAmount')::numeric)>0.011 then raise exception 'PURCHASE_TOTAL_OR_SUPPLIER'; end if;
      else
        if r->>'saleType'='wholesale' and not exists(select 1 from jsonb_array_elements(s->'customers') x where x->>'id'=r->>'customerId') then raise exception 'INVALID_SALES_CUSTOMER'; end if;
        if abs(total-(r->>'subtotal')::numeric)>0.011 or (r->>'discount')::numeric>total or abs(total-(r->>'discount')::numeric-(r->>'totalAmount')::numeric)>0.011 or abs(costs-(r->>'totalCost')::numeric)>0.011 or abs((r->>'netProfit')::numeric-((r->>'totalAmount')::numeric-costs))>0.011 then raise exception 'SALES_TOTAL_MISMATCH'; end if;
        if r->>'saleType' in ('retail','cashier_sync') and (r->>'remainingAmount')::numeric>0 then raise exception 'CASH_SALE_REQUIRES_PAYMENT'; end if;
      end if;
    end loop;
  end loop;
  for r in select value from jsonb_array_elements(s->'production_batches') loop
    if (r->>'quantityProducedKg')::numeric<=0 or not exists(select 1 from jsonb_array_elements(s->'items') x where x->>'id'=r->>'blendId' and x->>'category'='manufactured_blend') then raise exception 'INVALID_PRODUCTION'; end if;
    total:=0;
    for l in select value from jsonb_array_elements(r->'ingredientsConsumed') loop
      if (l->>'quantityUsed')::numeric<=0 or not exists(select 1 from jsonb_array_elements(s->'items') x where x->>'id'=l->>'ingredientId') then raise exception 'INVALID_PRODUCTION_INGREDIENT'; end if;
      total:=total+(l->>'cost')::numeric;
    end loop;
    if abs(total-(r->>'totalBatchCost')::numeric)>0.011 or abs(round(total/(r->>'quantityProducedKg')::numeric,2)-(r->>'unitCostPerKg')::numeric)>0.011 then raise exception 'PRODUCTION_COST_MISMATCH'; end if;
  end loop;
  for r in select value from jsonb_array_elements(s->'stocktaking_records') loop
    total:=0; costs:=0;
    for l in select value from jsonb_array_elements(r->'itemsAudited') loop
      if not exists(select 1 from jsonb_array_elements(s->'items') x where x->>'id'=l->>'itemId') or abs((l->>'actualStock')::numeric-(l->>'systemStock')::numeric-(l->>'difference')::numeric)>0.000001 or abs(round((l->>'difference')::numeric*(l->>'unitCost')::numeric,2)-(l->>'financialDifference')::numeric)>0.011 then raise exception 'INVALID_STOCKTAKING'; end if;
      if (l->>'financialDifference')::numeric<0 then total:=total-(l->>'financialDifference')::numeric; else costs:=costs+(l->>'financialDifference')::numeric; end if;
    end loop;
    if abs(total-(r->>'totalShortageValue')::numeric)>0.011 or abs(costs-(r->>'totalSurplusValue')::numeric)>0.011 or abs(costs-total-(r->>'netVarianceValue')::numeric)>0.011 then raise exception 'STOCKTAKING_TOTAL_MISMATCH'; end if;
  end loop;
  for r in select value from jsonb_array_elements(s->'account_payments') loop
    f:=case when r->>'targetType'='supplier' then 'suppliers' else 'customers' end;
    if (r->>'amount')::numeric<=0 or not exists(select 1 from jsonb_array_elements(s->f) x where x->>'id'=r->>'targetId') then raise exception 'INVALID_PAYMENT_TARGET'; end if;
    if r ? 'allocations' then
      total:=coalesce((r->>'openingBalanceAmount')::numeric,0);
      f:=case when r->>'targetType'='supplier' then 'purchase_invoices' else 'sales_invoices' end;
      for l in select value from jsonb_array_elements(r->'allocations') loop
        select x into linked from jsonb_array_elements(s->f) x where x->>'id'=l->>'invoiceId';
        if linked is null or coalesce(linked->>'supplierId',linked->>'customerId')<>r->>'targetId' or (l->>'amount')::numeric<=0 then raise exception 'INVALID_PAYMENT_ALLOCATION'; end if;
        total:=total+(l->>'amount')::numeric;
      end loop;
      if abs(total-(r->>'amount')::numeric)>0.011 then raise exception 'PAYMENT_ALLOCATION_MISMATCH'; end if;
    end if;
  end loop;
  for r in select value from jsonb_array_elements(s->'employee_transactions') loop
    if not exists(select 1 from jsonb_array_elements(s->'employees') x where x->>'id'=r->>'employeeId') then raise exception 'INVALID_EMPLOYEE_REFERENCE'; end if;
    if r->>'accountingVersion'='1' then
      if r->>'type' not in ('سلفة','حضور يومية','خصم/عجز','مكافأة','صرف راتب','إقفال شهر') or not exists(select 1 from jsonb_array_elements(s->'partners') x where x->>'id'=r->>'partnerId') then raise exception 'INVALID_PAYROLL_ACTION'; end if;
      if r->>'type' in ('سلفة','صرف راتب') then
        select x into linked from jsonb_array_elements(s->'expenses') x where x->>'id'=r->>'expenseId';
        if linked is null or linked->>'sourceEmployeeTransactionId'<>r->>'id' or linked->>'category'<>'رواتب ويوميات' or linked->>'paidFrom'<>r->>'paidFrom' or linked->>'partnerId'<>r->>'partnerId' or (linked->>'amount')::numeric<>(r->>'amount')::numeric or coalesce((linked->>'isCancelled')::boolean,false)<>(r ? 'reversedAt') then raise exception 'PAYROLL_EXPENSE_MISMATCH'; end if;
      elsif r ? 'expenseId' then raise exception 'NONCASH_PAYROLL_EXPENSE'; end if;
      if r->>'type'='إقفال شهر' then
        linked:=r->'closingSummary';
        if linked is null or abs((linked->>'openingPayable')::numeric+(linked->>'earned')::numeric+(linked->>'bonuses')::numeric-(linked->>'advances')::numeric-(linked->>'deductions')::numeric-(linked->>'paidOut')::numeric-(linked->>'carryForward')::numeric)>0.011 then raise exception 'PAYROLL_CLOSING_MISMATCH'; end if;
      end if;
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(s->'employee_transactions') x where x->>'type'='إقفال شهر' group by x->>'employeeId',x->>'payrollPeriod' having count(*)>1) then raise exception 'PAYROLL_ALREADY_CLOSED'; end if;
  for r in select value from jsonb_array_elements(s->'expenses') loop
    if r ? 'sourceEmployeeTransactionId' and not exists(select 1 from jsonb_array_elements(s->'employee_transactions') x where x->>'id'=r->>'sourceEmployeeTransactionId' and x->>'expenseId'=r->>'id') then raise exception 'ORPHAN_PAYROLL_EXPENSE'; end if;
    if r ? 'partnerId' and not exists(select 1 from jsonb_array_elements(s->'partners') x where x->>'id'=r->>'partnerId') then raise exception 'INVALID_EXPENSE_PARTNER'; end if;
    if (r->>'amount')::numeric<=0 then raise exception 'INVALID_EXPENSE_AMOUNT'; end if;
  end loop;
end $$;

create or replace function bon_erp_private.check_store_write() returns trigger
language plpgsql set search_path='' as $$
declare s jsonb:=to_jsonb(new)-array['id','version','updated_at','updated_by'];
begin
  perform bon_erp_private.validate_payload(s);
  return new;
end $$;
revoke all on function bon_erp_private.valid_date(text),bon_erp_private.base_quantity(numeric,text,text),bon_erp_private.validate_payload(jsonb),bon_erp_private.check_store_write() from public,anon,authenticated;
create trigger bon_erp_validate_store before update on public.bon_elagouz_store for each row execute function bon_erp_private.check_store_write();
commit;
