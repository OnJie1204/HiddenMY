import { useState } from "react";
import ReportModal from "@/components/community/ReportModal";
import VerifyReportModal from "@/components/community/VerifyReportModal";
import { getReportForLocation } from "@/features/community/reportsApi";
import { useResumeIntent } from "@/utils/auth/useResumeIntent";
import { useAuthPrompt } from "@/context/auth/AuthPromptContext";

// Any publicly-visible place can be reported (permanently_closed /
// incorrect_contact_info). The backend enforces the rest and returns the
// reasons still open for this place.
const REPORTABLE_STATUSES = ["hidden_gem", "well_known", "pending_community_vote"];

function ReportButton({ gem, user, onReportSuccess, onVerifySuccess }) {
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [verifyModalOpen, setVerifyModalOpen] = useState(false);
    const [activeReport, setActiveReport] = useState(null);
    const [loadingReport, setLoadingReport] = useState(false);
    const { requireAuth } = useAuthPrompt();

    // "report" resumes here (re-open the modal — never auto-file); "verify" is
    // left for the detail page's own handler, which does the report lookup.
    useResumeIntent({
        report: (intent) => {
            if (intent.gemId != null && Number(intent.gemId) !== Number(gem?.id)) return false;
            setReportModalOpen(true);
        },
    }, !!gem && !!user);

    if (!gem) return null;

    // Raw API responses use report_status; Maps.jsx's normalizeGem camelCases
    // it to reportStatus — accept either so this drops into any page's gem shape.
    const reportStatus = gem.reportStatus ?? gem.report_status;
    const isPending = reportStatus === "under_review";
    const isClosed = !!(gem.permanently_closed_at || gem.permanentlyClosedAt);
    const canAct = REPORTABLE_STATUSES.includes(gem.status) && !isClosed;

    async function handleClick(e) {
        e.stopPropagation();

        // Guests can see the icon (it advertises the feature), but reporting
        // and verifying both require an account — skip the API round-trip
        // entirely and just point them at sign-in.
        if (!user) {
            requireAuth({
                reason: isPending ? "verifyReport" : "report",
                gemId: gem.id,
            });
            return;
        }

        if (!isPending) {
            setReportModalOpen(true);
            return;
        }
        // Ineligibility (own report, own gem, already voted) surfaces inside
        // the modal itself, same as everywhere else — no need to pre-check here.
        setLoadingReport(true);
        try {
            const res = await getReportForLocation(gem.id);
            setActiveReport(res.data.data);
            setVerifyModalOpen(true);
        } catch (error) {
            console.error("Error checking report status:", error);
        } finally {
            setLoadingReport(false);
        }
    }

    return (
        <>
            <button
                type="button"
                className="report-toggle-btn"
                onClick={handleClick}
                disabled={!canAct || loadingReport}
                title={isPending ? "Help verify a reported problem with this gem" : "Report a problem with this gem"}
            >
                ⚠
            </button>
            <ReportModal
                locationId={gem.id}
                isOpen={reportModalOpen}
                onClose={() => setReportModalOpen(false)}
                onReportSuccess={onReportSuccess}
            />
            <VerifyReportModal
                report={activeReport}
                isOpen={verifyModalOpen}
                onClose={() => setVerifyModalOpen(false)}
                onVerifySuccess={onVerifySuccess}
            />
        </>
    );
}

export default ReportButton;
