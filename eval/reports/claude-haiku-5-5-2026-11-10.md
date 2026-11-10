# Accuracy report: claude-haiku-5-5

Run on 2026-11-10 00:01 UTC. Model: `claude-haiku-5-5`. Documents: 18.

| Measure | Result |
|---|---|
| Field accuracy | **100.0%** (918 of 918 fields) |
| Line items found | 90 of 90 |
| Extra lines invented | 0 |
| Planted problems caught | 14 of 14 |
| Documents with a false alarm | 0 |
| API cost of this run | $0.0198 ($0.0011 per document) |
| Average time per document | 5.2 s |

## Accuracy by field (weakest first)

| Field | Right | Accuracy |
|---|---|---|
| description | 90 / 90 | 100.0% |
| discount | 18 / 18 | 100.0% |
| document_date | 18 / 18 | 100.0% |
| document_number | 18 / 18 | 100.0% |
| document_type | 18 / 18 | 100.0% |
| language | 18 / 18 | 100.0% |
| line_total | 90 / 90 | 100.0% |
| pack_size | 90 / 90 | 100.0% |
| po_number | 18 / 18 | 100.0% |
| quantity | 90 / 90 | 100.0% |
| quantity_backordered | 90 / 90 | 100.0% |
| shipping | 18 / 18 | 100.0% |
| sku | 90 / 90 | 100.0% |
| subtotal | 18 / 18 | 100.0% |
| supplier_name | 18 / 18 | 100.0% |
| tax | 18 / 18 | 100.0% |
| total | 18 / 18 | 100.0% |
| unit | 90 / 90 | 100.0% |
| unit_price | 90 / 90 | 100.0% |

## By document

| Document | Field accuracy | Problems caught | Missed | False alarms |
|---|---|---|---|---|
| 01-invoice-basic | 100.0% | 0 / 0 | - | - |
| 02-packing-slip-basic | 100.0% | 0 / 0 | - | - |
| 03-invoice-discount-freight-tax | 100.0% | 0 / 0 | - | - |
| 04-invoice-line-math-error | 100.0% | 1 / 1 | - | - |
| 05-invoice-subtotal-error | 100.0% | 1 / 1 | - | - |
| 06-packing-slip-backorder | 100.0% | 1 / 1 | - | - |
| 07-packing-slip-short | 100.0% | 1 / 1 | - | - |
| 08-factura-spanish | 100.0% | 0 / 0 | - | - |
| 09-invoice-two-pages | 100.0% | 0 / 0 | - | - |
| 10-photo-packing-slip | 100.0% | 0 / 0 | - | - |
| 11-photo-invoice-blurry | 100.0% | 0 / 0 | - | - |
| 12-invoice-cases-vs-each | 100.0% | 1 / 1 | - | - |
| 13-packing-slip-hand-correction | 100.0% | 2 / 2 | - | - |
| 14-packing-slip-substitution | 100.0% | 2 / 2 | - | - |
| 15-handwritten-farm-invoice | 100.0% | 2 / 2 | - | - |
| 16-invoice-odd-formats | 100.0% | 0 / 0 | - | - |
| 17-invoice-duplicate-lines-over | 100.0% | 2 / 2 | - | - |
| 18-factura-photo-price | 100.0% | 1 / 1 | - | - |

## Every wrong field (0)

None.
