# Agouz online development plan

Approved scope: bounded server reads, consistent section controls, Python cashier-file processing, actionable reports and operational monitoring. Existing SQL financial checks remain authoritative. No paid upgrade is authorized.

- [x] Verified recovery baseline: production bccd915, backup run 41741200210, 54 tables and Auth restored from the downloaded encrypted Drive archive.
- [ ] Server dashboard aggregates, bounded invoice history/search and on-demand details; full transactional state loads only when an operation needs it.
- [ ] Shared record controls, explicit loading/error/empty states and accessible filters/forms.
- [ ] Authenticated Python import service, private uploads, durable processing status, bounded parsing and preview before financial approval.
- [ ] Match real cashier financial/items files from one business date when supplied. Synthetic files must remain isolated.
- [ ] Traceable report figures, period comparisons and actionable processing/save/backup status.
- [ ] Security regression, complete recovery coverage, slow-mobile measurement, production verification and fresh verified Drive capture.

Financial invariants: moving-average purchase cost excludes tax; new purchases fully paid; wholesale requires a registered customer and blends with a manual price; production only for blends with sufficient ingredients; prepared drinks and seasoning consume recipes at sale; paired daily cashier reports may expose negative stock and cannot be duplicated; prepared-drink returns do not restore consumed ingredients. Unknown financial values never render as confirmed zero. Master login cannot be deleted or disabled; financial partners remain separate.

Release gates: database permission/parity tests, existing financial regressions, malformed and oversized upload tests, real CSV/XLSX parser tests, mobile/desktop interactions, measured bounded network reads, deployment verification, and recovery verification. The cashier-device acceptance and paid leaked-password protection have explicit external prerequisites.
