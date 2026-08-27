import { useState } from "react";
import ReportModal from "./ReportModal";
import VerifyReportModal from "./VerifyReportModal";
import SignInPrompt from "./SignInPrompt";
import { getReportForLocation } from "../api/reports";

const REPORTABLE_STATUSES = ["hidden_gem", "pending_community_vote"];

function ReportButton({ gem, user, onReportSuccess, onVerifySuccess }) {
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [verifyModalOpen, setVerifyModalOpen] = useState(false);
    const [activeReport, setActiveReport] = useState(null);
    const [loadingReport, setLoadingReport] = useState(false);
    const [showSignIn, setShowSignIn] = useState(false);

    if (!gem) return null;

    // Raw API responses use report_status; Maps.jsx's normalizeGem camelCases
    // it to reportStatus — accept either so this drops into any page's gem shape.
    const reportStatus = gem.reportStatus ?? gem.report_status;
    const isPending = reportStatus === "under_review";
    const canAct = REPORTABLE_STATUSES.includes(gem.status);

    async function handleClick(e) {
        e.stopPropagation();

        // Guests can see the icon (it advertises the feature), but reporting
        // and verifying both require an account — skip the API round-trip
        // entirely and just point them at sign-in.
        if (!user) {
            setShowSignIn(true);
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
            <SignInPrompt
                isOpen={showSignIn}
                onClose={() => setShowSignIn(false)}
                message={isPending
                    ? "Login to help verify this report."
                    : "Login to report a problem with this gem."}
            />
        </>
    );
}

export default ReportButton;
