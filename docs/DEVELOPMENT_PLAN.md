# Agouz online development plan

Approved scope: bounded server reads, consistent section controls, Python cashier-file processing, actionable reports and operational monitoring. Existing SQL financial checks remain authoritative. No paid upgrade is authorized.

- [x] Verified recovery baseline: production bccd915, backup run 41741200210, 54 tables and Auth restored from the downloaded encrypted Drive archive.
- [x] Server dashboard aggregates, bounded invoice history/search and on-demand details; full transactional state loads only when an operation needs it.
- [x] Shared record controls, explicit loading/error/empty states and accessible filters/forms.
- [x] Authenticated Python import service, private uploads, durable processing status, bounded parsing and preview before financial approval.
- [ ] Match real cashier financial/items files from one business date when supplied. Synthetic files must remain isolated.
- [x] Traceable report figures, period comparisons and actionable processing/save/backup status.
- [ ] Security regression, complete recovery coverage, slow-mobile measurement, production verification and fresh verified Drive capture.

Financial invariants: moving-average purchase cost excludes tax; new purchases fully paid; wholesale requires a registered customer and blends with a manual price; production only for blends with sufficient ingredients; prepared drinks and seasoning consume recipes at sale; paired daily cashier reports may expose negative stock and cannot be duplicated; prepared-drink returns do not restore consumed ingredients. Unknown financial values never render as confirmed zero. Master login cannot be deleted or disabled; financial partners remain separate.

Release gates: database permission/parity tests, existing financial regressions, malformed and oversized upload tests, real CSV/XLSX parser tests, mobile/desktop interactions, measured bounded network reads, deployment verification, and recovery verification. The cashier-device acceptance and paid leaked-password protection have explicit external prerequisites.

Implementation notes (release verification still pending):
- Python 3.12/FastAPI lives beside the Vite frontend in the same Vercel project. The service entrypoint is pyproject.toml. The database owns the durable job queue, leases and retry dispatch. Vercel Services and pg_net are Beta; no paid tier was purchased. Native Vercel Queues were removed after a real preview callback failed to confirm acknowledgment.
- Each file has a private immutable object, date/type reservation, owner, bounded parser result and per-job worker credential. A FastAPI background task starts promptly; a private Supabase Cron dispatcher retries interrupted requests every minute, at most two jobs per tick. Processing creates a pending review receipt, never a financial posting. A ready file cannot be cancelled after attachment. Failed/expired uploads have explicit recovery paths.
- Parser limits: 10 MB source, 10,000 rows, 100 columns, 200,000 cells and 2 MB result. Expanded XLSX content is bounded; macros and unsafe/ambiguous files are refused. Exact catalog matches are advisory; the existing full SQL validation remains authoritative at approval.
- Operational screens continue to load the canonical transaction state for safe writes. Dashboard, section counts and invoice browsing use bounded server projections. Cashier queue content and invoice details load individually on request.
- The backup storage reader can write only a narrow recovery-status receipt through a guarded RPC, without ERP/file write privileges. Only the successful export + downloaded-archive restore + verified-pointer sequence reports a new verified time. An unavailable receipt is displayed as unknown, and a failed run preserves the last verified time.
- Real-device report acceptance requires actual financial and item reports from one date. No synthetic sales or inventory postings are permitted in production.

Recovery isolation: restore-verification containers use an internal Docker network, disable Cron job launches, and point pg_net at a nonexistent isolated database. A restored scheduler must never invoke production endpoints. After a deliberate real recovery, explicitly review and reactivate scheduled jobs only on the chosen target.
