import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";

const detailSource = readFileSync(
    resolve(process.cwd(), "resources/js/pages/hidden-gems/HiddenGemDetail.jsx"),
    "utf8",
);
const managementSource = readFileSync(
    resolve(process.cwd(), "resources/js/pages/hidden-gems/MyHiddenGems.jsx"),
    "utf8",
);
const verifyModalSource = readFileSync(
    resolve(process.cwd(), "resources/js/components/community/VerifyReportModal.jsx"),
    "utf8",
);
const reportModalSource = readFileSync(
    resolve(process.cwd(), "resources/js/components/community/ReportModal.jsx"),
    "utf8",
);
const reportsApiSource = readFileSync(
    resolve(process.cwd(), "resources/js/features/community/reportsApi.js"),
    "utf8",
);
const globalCssSource = readFileSync(
    resolve(process.cwd(), "resources/css/base/global.css"),
    "utf8",
);

test("Location Detail renders every active report with separate progress", () => {
    assert.match(detailSource, /active_reports/);
    assert.match(detailSource, /activeReports\.map\(\(report\)/);
    assert.match(detailSource, /report\.confirm_count/);
    assert.match(detailSource, /report\.dispute_count/);
    assert.match(detailSource, /report\.verification_threshold/);
});

test("each eligible report opens verification with that report object", () => {
    assert.match(detailSource, /onClick=\{\(\) => onVerify\(report\)\}/);
    assert.match(detailSource, /\{report\.can_verify && \(/);
});

test("all authenticated viewers use one Report card structure", () => {
    assert.match(detailSource, /function ActiveReportCard/);
    assert.equal((detailSource.match(/<ActiveReportCard/g) || []).length, 1);
    assert.doesNotMatch(detailSource, /return isOwner \?/);
    assert.doesNotMatch(detailSource, /owner=\{?true\}?/);
});

test("every authenticated Report card retains the warning icon", () => {
    const card = detailSource.match(/function ActiveReportCard[\s\S]*?\n\}/)?.[0] ?? "";

    assert.match(card, /authenticated-report-icon/);
    assert.match(card, /aria-hidden="true">⚠<\/span>/);
});

test("all authenticated report banners share escaped conditional Report details", () => {
    const information = detailSource.match(/function ActiveReportCard[\s\S]*?\n\}/)?.[0] ?? "";

    assert.match(information, /report\.reason_label/);
    assert.match(information, /Under Community Review/);
    assert.match(information, /report\.description\.trim\(\) !== ""/);
    assert.match(information, /<strong>Report details<\/strong>/);
    assert.match(information, /\{report\.description\}/);
    assert.match(information, /report\.confirm_count/);
    assert.match(information, /report\.dispute_count/);
    assert.doesNotMatch(information, /dangerouslySetInnerHTML/);
});

test("Help Verify is in the shared header and can_verify renders no empty action wrapper", () => {
    const header = detailSource.match(/<div className="authenticated-report-header">([\s\S]*?)<\/div>\n\n            <div className="report-banner-text authenticated-report-body">/)?.[1] ?? "";

    assert.match(
        header,
        /\{report\.can_verify && \([\s\S]*?onClick=\{\(\) => onVerify\(report\)\}[\s\S]*?Help Verify[\s\S]*?\)\}/,
    );
    assert.doesNotMatch(header, /report-action-wrapper/);
});

test("authenticated Report header wraps responsively without changing shared banner defaults", () => {
    assert.match(globalCssSource, /\.authenticated-report-header \{[\s\S]*?flex-wrap: wrap;/);
    assert.match(globalCssSource, /\.authenticated-report-heading \{[\s\S]*?min-width: 0;/);
    assert.match(globalCssSource, /@media \(max-width: 480px\)[\s\S]*?\.authenticated-report-header \.report-banner-verify-btn/);
});

test("My Hidden Gems shows one compact warning indicator from the boolean server field", () => {
    assert.match(managementSource, /import \{ MdOutlineReportProblem \} from "react-icons\/md"/);
    assert.match(managementSource, /\{gem\.has_active_report && \(/);
    assert.match(managementSource, /<MdOutlineReportProblem aria-hidden="true" \/>/);
    assert.match(managementSource, /Report Under Review/);
    assert.equal((managementSource.match(/Report Under Review/g) || []).length, 1);
});

test("the card warning does not replace existing status or management actions", () => {
    assert.match(managementSource, /getGemStatusDisplay\(gem\)\.label/);
    assert.match(managementSource, /gem\.can_edit/);
    assert.match(managementSource, /gem\.can_delete/);
});

test("guest receives one generic warning without rendering report records", () => {
    const message = "Information for this Hidden Gem is under community review.";

    assert.match(detailSource, /!currentUser && gem\.has_active_report/);
    assert.equal((detailSource.match(new RegExp(message.replaceAll(".", "\\."), "g")) || []).length, 1);
    assert.doesNotMatch(message, /reason|description|confirm|dispute|verify/i);
});

test("Report verification no longer collects or submits a voter comment", () => {
    assert.doesNotMatch(verifyModalSource, /const \[comment, setComment\]/);
    assert.doesNotMatch(verifyModalSource, /Comment \(optional\)/);
    assert.doesNotMatch(verifyModalSource, /<textarea/);
    assert.match(verifyModalSource, /verifyReport\(target\.id, \{ verdict \}\)/);
    assert.match(reportsApiSource, /verifyReport = \(reportId, \{ verdict \}\)/);
    assert.match(reportsApiSource, /verify`, \{ verdict \}\)/);
});

test("selected Report summary and verification request use the same target", () => {
    assert.match(verifyModalSource, /REASON_LABELS\[target\.reason\] \|\| target\.reason/);
    assert.match(verifyModalSource, /target\.description/);
    assert.match(verifyModalSource, /href=\{target\.photo_path\}/);
    assert.match(verifyModalSource, /src=\{target\.photo_path\}/);
    assert.match(verifyModalSource, /verifyReport\(target\.id, \{ verdict \}\)/);
    assert.doesNotMatch(verifyModalSource, /REASON_LABELS\[report\.reason\]/);
});

test("Confirm and Dispute remain and original Report description is retained", () => {
    assert.match(verifyModalSource, /handleVerdict\('confirm'\)/);
    assert.match(verifyModalSource, /handleVerdict\('dispute'\)/);
    assert.match(reportModalSource, /const \[description, setDescription\]/);
    assert.match(reportModalSource, /formData\.append\('description', description\)/);
    assert.match(reportModalSource, /<textarea/);
});
