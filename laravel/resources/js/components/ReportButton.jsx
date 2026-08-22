import { useState } from "react";
import ReportModal from "./ReportModal";

const REPORTABLE_STATUSES = ["hidden_gem", "pending_community_vote"];

function ReportButton({ gem, onReportSuccess }) {
    const [open, setOpen] = useState(false);

    if (!gem) return null;

    // Raw API responses use report_status; Maps.jsx's normalizeGem camelCases
    // it to reportStatus — accept either so this drops into any page's gem shape.
    const reportStatus = gem.reportStatus ?? gem.report_status;
    const canReport = REPORTABLE_STATUSES.includes(gem.status) && reportStatus !== "under_review";

    return (
        <>
            <button
                type="button"
                className="report-toggle-btn"
                onClick={(e) => { e.stopPropagation(); setOpen(true); }}
                disabled={!canReport}
                title={reportStatus === "under_review"
                    ? "This gem already has a report under review"
                    : "Report a problem with this gem"}
            >
                ⚠
            </button>
            <ReportModal
                locationId={gem.id}
                isOpen={open}
                onClose={() => setOpen(false)}
                onReportSuccess={onReportSuccess}
            />
        </>
    );
}

export default ReportButton;
