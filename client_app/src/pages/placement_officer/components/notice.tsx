import { forwardRef } from "react";
import "./notice.css";
import noticeHeader from "@/assets/tcet header.png";
import noticeFooter from "@/assets/tcet footer.png";

export interface NoticeTableRow {
  type: string;
  salary: string;
  position: string;
}

export interface NoticeData {
  srNo?: string;
  to?: string;
  subject?: string;
  date?: string;
  intro?: string;
  eligibility_criteria?: string;
  roles?: string;
  about?: string;
  skill_required?: string;
  Documents_to_Carry?: string;
  Walk_in_interview?: string;
  Company_registration_Link?: string;
  Note?: string;
  From?: string;
  From_designation?: string;
  companyId?: string;
  noticeId?: string;
  tableData?: NoticeTableRow[];
  College_registration_Link?: string;
  location?: string;
  deadline?: string;
}

interface NoticeProps {
  formData: NoticeData;
  isPlacement?: boolean;
}

const formatNoticeDate = (dateStr?: string): string => {
  if (!dateStr) {
    return new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const formatDeadlineSentence = (deadlineStr?: string): string => {
  if (!deadlineStr || !deadlineStr.trim()) {
    return "All the eligible and interested students are required to register their names online latest by 30.09.2026 by 10.00 am.";
  }
  const trimmed = deadlineStr.trim();
  if (trimmed.toLowerCase().startsWith("all the eligible")) {
    return trimmed;
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (isoMatch) {
    const [, year, month, day, hours, minutes] = isoMatch;
    const dateFormatted = `${day}.${month}.${year}`;
    let timeFormatted = "10.00 am";
    if (hours !== undefined && minutes !== undefined) {
      const h = parseInt(hours, 10);
      const ampm = h >= 12 ? "pm" : "am";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      const mStr = minutes.padStart(2, "0");
      timeFormatted = `${h12}.${mStr} ${ampm}`;
    }
    return `All the eligible and interested students are required to register their names online latest by ${dateFormatted} by ${timeFormatted}.`;
  }
  return `All the eligible and interested students are required to register their names online latest by ${trimmed}.`;
};

const renderBulletList = (text?: string) => {
  if (!text || !text.trim()) return null;

  const rawLines = text
    .split(/\r?\n|•|\*/)
    .map((item) => item.replace(/^[\-\s]+/, "").trim())
    .filter(Boolean);

  if (rawLines.length === 0) return <span>{text}</span>;

  if (rawLines.length === 1 && !text.includes("•") && !text.includes("\n") && !text.includes("*")) {
    return <span>{text}</span>;
  }

  return (
    <ul className="notice-bullet-list">
      {rawLines.map((line, idx) => (
        <li key={idx} className="notice-bullet-item">
          {line}
        </li>
      ))}
    </ul>
  );
};

const Notice = forwardRef<HTMLDivElement, NoticeProps>(
  ({ formData, isPlacement = true }, ref) => {
    // Determine rows for Placement Details Table with guaranteed fallback values
    const rows: NoticeTableRow[] =
      formData.tableData && formData.tableData.length > 0
        ? formData.tableData.map((row) => ({
            type: row.type?.trim() || "Regular",
            salary: row.salary?.trim() || "Not specified",
            position: row.position?.trim() || "Not specified",
          }))
        : formData.roles?.trim()
        ? [
            {
              type: "Regular",
              salary: "As per company norms",
              position: formData.roles.trim(),
            },
          ]
        : [
            {
              type: "Regular",
              salary: "Not specified",
              position: "Graduate Engineer Trainee / Analyst",
            },
          ];

    const serialNumber =
      formData.srNo?.trim() ||
      `TCET/T&P/OFF/${new Date().getFullYear()}/${isPlacement ? "PL" : "INT"}-001`;

    const formattedDate = formatNoticeDate(formData.date);

    return (
      <div className="notice-document-wrapper">
        <div className="main-notice" ref={ref}>
          {/* 1. Official TCET Letterhead Header */}
          <div className="notice-header-container">
            <img
              src={noticeHeader}
              alt="Thakur College of Engineering & Technology"
              className="header-image"
            />
          </div>

          {/* Constant Institutional Metadata Top Block */}
          <div className="constant-top-block">
            <div className="top-doc-meta">
              <span className="doc-code">TCET/FRM/MP-04/11</span>
              <span className="doc-revision">Revision: B</span>
            </div>
            <div className="top-cell-title">Training and Placement Cell</div>
          </div>

          {/* 2. Notice Title */}
          <h2 className="content-header">NOTICE</h2>

          {/* 3. Notice Metadata (Serial No. & Date) */}
          <div className="flex-container metadata-row">
            <p className="metadata-item">
              <span className="notice-label">Sr. No:</span>
              <span className="metadata-val">{serialNumber}</span>
            </p>
            <p className="metadata-item">
              <span className="notice-label">Date:</span>
              <span className="metadata-val">{formattedDate}</span>
            </p>
          </div>

          {/* Main Notice Body */}
          <div className="main-body text-black">
            {/* 4. To Section */}
            <p className="notice-row">
              <span className="notice-label">To:</span>
              <span>{formData.to || "All Eligible Final Year Students"}</span>
            </p>

            {/* 5. Subject (Both label and content underlined) */}
            <p className="notice-row subject-row">
              <u className="subject-underline">
                <span className="notice-label">Subject:</span>{" "}
                <span className="subject-text">{formData.subject}</span>
              </u>
            </p>

            {/* 6. Introduction */}
            {formData.intro && (
              <p className="notice-row">
                <span className="notice-label">Intro:</span>
                <span>{formData.intro}</span>
              </p>
            )}

            {/* 7. Eligibility Criteria */}
            {formData.eligibility_criteria && (
              <p className="notice-row">
                <span className="notice-label">Eligibility Criteria:</span>
                <div>{renderBulletList(formData.eligibility_criteria)}</div>
              </p>
            )}

            {/* 8. About Company */}
            {formData.about && formData.about.trim() && (
              <p className="notice-row">
                <span className="notice-label">About Company:</span>
                <span>{formData.about}</span>
              </p>
            )}

            {/* 9. Location */}
            {formData.location && (
              <p className="notice-row">
                <span className="notice-label">Location:</span>
                <span>{formData.location}</span>
              </p>
            )}

            {/* 10. Placement Details Table */}
            <div className="table-wrapper">
              <table className="placement-details-table">
                <thead>
                  <tr>
                    <th style={{ width: "25%" }}>Type</th>
                    <th style={{ width: "30%" }}>CTC</th>
                    <th style={{ width: "45%" }}>Position</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index}>
                      <td>{row.type}</td>
                      <td>{row.salary}</td>
                      <td>{row.position}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Skills Required if present */}
            {formData.skill_required && formData.skill_required.trim() && (
              <p className="notice-row">
                <span className="notice-label">Skills Required:</span>
                <div>{renderBulletList(formData.skill_required)}</div>
              </p>
            )}

            {/* 11. Documents to Carry */}
            <p className="notice-row">
              <span className="notice-label">Documents to Carry:</span>
              <div>
                {renderBulletList(
                  formData.Documents_to_Carry ||
                    "Updated Resume (2 hard copies), College ID Card, Govt Photo ID Proof, and Marksheets from 10th onwards."
                )}
              </div>
            </p>

            {/* 12. Selection Process (Replaces Walk-in Interview) */}
            <p className="notice-row">
              <span className="notice-label">Selection Process:</span>
              <div>
                {renderBulletList(
                  formData.Walk_in_interview ||
                    "Schedule and venue details will be communicated via official T&P cell notification."
                )}
              </div>
            </p>

            {/* 13. Deadline to Register */}
            <p className="notice-row">
              <span className="notice-label">Deadline to Register:</span>
              <span>{formatDeadlineSentence(formData.deadline)}</span>
            </p>

            {/* 14. Company Registration Link (College Registration Link removed) */}
            {formData.Company_registration_Link &&
              formData.Company_registration_Link.trim() && (
                <p className="notice-row">
                  <span className="notice-label">Registration Link:</span>
                  <a
                    href={formData.Company_registration_Link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="notice-link"
                  >
                    {formData.Company_registration_Link}
                  </a>
                </p>
              )}

            {/* 15. Important Note */}
            {formData.Note && formData.Note.trim() && (
              <p className="notice-row note-row">
                <span className="notice-label">Note:</span>
                <span>{formData.Note}</span>
              </p>
            )}
          </div>

          {/* 16. Signature / Issuing Authority Block */}
          <div className="fromto-signature-block">
            <p className="sig-sd">Sd/-</p>
            <p className="sig-name">{formData.From || "(Dr. Zahir Aalam)"}</p>
            <p className="sig-designation">
              {formData.From_designation ||
                "Training and Placement Officer (TPO), TCET"}
            </p>
          </div>

          {/* 17. Copy To Section (Structured Institutional Layout) */}
          <div className="notice-copyto-block">
            <div className="copyto-header">Copy to:</div>
            <div className="copyto-grid">
              <div className="copyto-col-items">
                <ul className="copyto-list">
                  <li>Principal</li>
                  <li>Vice Principal</li>
                  <li>All Deans</li>
                  <li>All HODs</li>
                  <li>Website</li>
                  <li>Notice Board of TCET</li>
                </ul>
              </div>
              <div className="copyto-col-annotations">
                <div className="annotation-tier tier-top">
                  <span className="brace-symbol">&#125;</span>
                  <span className="annotation-label">For kind information please</span>
                </div>
                <div className="annotation-tier tier-bottom">
                  <span className="brace-symbol-large">&#125;</span>
                  <span className="annotation-label">For necessary communication</span>
                </div>
              </div>
            </div>
          </div>

          {/* 18. TCET Footer Image */}
          <img src={noticeFooter} alt="Footer" className="footer-image" />
        </div>
      </div>
    );
  }
);

export default Notice;