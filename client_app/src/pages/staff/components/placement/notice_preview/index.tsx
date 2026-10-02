import { forwardRef } from "react";
import "./notice.css";
import noticeHeader from "@/assets/tcet header.png";
import noticeFooter from "@/assets/tcet footer.png";
import { FormDataType } from "@/pages/staff/placement_company";

interface NoticeFormData extends FormDataType {
  id: number;
}

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

const notice = forwardRef<
  HTMLDivElement,
  { formData: NoticeFormData; isPlacement?: boolean }
>(({ formData, isPlacement: _isPlacement = true }, ref) => {
  const hasMultipleJobs = formData.job_offers.length > 1;
  const singleJob = !hasMultipleJobs ? formData.job_offers[0] : null;

  return (
    <div className="notice-body">
      <div className="notice-container" ref={ref}>
        {/* Header */}
        <img src={noticeHeader} alt="Header" className="header-image" />

        {/* Constant Institutional Metadata Top Block */}
        <div className="constant-top-block">
          <div className="top-doc-meta">
            <span className="doc-code">TCET/FRM/MP-04/11</span>
            <span className="doc-revision">Revision: B</span>
          </div>
          <div className="top-cell-title">Training and Placement Cell</div>
        </div>

        <h2 className="notice-title">NOTICE</h2>

        <div className="notice-meta">
          <p>
            <strong>Sr. No:</strong> TCET/T&P/PMT {formData.id || ''}{" "} of{" "}
            {new Date().getFullYear()}
          </p>
          <p>
            <strong>Date:</strong> {formData.notice.date}
          </p>
        </div>

        {/* Body */}
        <div className="notice-content">
          <p>
            <strong>To:</strong> All concerned Students of {formData.batch}{" "}
            Batch
          </p>

          <p>
            <u>
              <strong>Sub:</strong> {formData.notice.subject}
            </u>
          </p>

          <ol>
            <li>{formData.notice.intro}</li>

            <li>
              <strong>Eligibility Criteria:</strong>
              <table className="notice-table" style={{ width: "100%" }}>
                <tbody>
                  <tr>
                    <td><strong>10th Marks</strong></td>
                    <td>{parseInt(formData.min_tenth_marks) <= 0 ? "N/A" : `>=${formData.min_tenth_marks}%`}</td>
                  </tr>
                  <tr>
                    <td><strong>12th Marks</strong></td>
                    <td>{parseInt(formData.min_higher_secondary_marks) <= 0 ? "N/A" : `>=${formData.min_higher_secondary_marks}%`}</td>
                  </tr>
                  <tr>
                    <td><strong>CGPA</strong></td>
                    <td>{parseInt(formData.min_cgpa) <= 0 ? "N/A" : `≥ ${formData.min_cgpa}`}</td>
                  </tr>
                  <tr>
                    <td><strong>Backlogs Accepted</strong></td>
                    <td>{formData.accepted_kt ? "Yes" : "No"}</td>
                  </tr>
                  <tr>
                    <td><strong>Eligible Departments</strong></td>
                    <td>{formData.selected_departments.join(", ")}</td>
                  </tr>
                </tbody>
              </table>
            </li>

            {!hasMultipleJobs && singleJob && (
              <>
                <li>
                  <strong>Designation:</strong> {singleJob.role}
                </li>

                <li>
                  <strong>Key Responsibilities:</strong>
                  <ul>
                    {singleJob.skills.split("\n").map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ul>
                </li>

                <li>
                  <strong>Emoluments (CTC):</strong> {singleJob.salary}
                </li>
              </>
            )}

            {hasMultipleJobs && (
              <li>
                <strong>Job Roles:</strong>
                <table className="notice-table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Salary (CTC)</th>
                      <th>Skills / Responsibilities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.job_offers.map((job, index) => (
                      <tr key={index}>
                        <td>{job.role}</td>
                        <td>{job.salary}</td>
                        <td style={{ textAlign: "left" }}>{job.skills}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </li>
            )}

            <li>
              <strong>About Company:</strong> {formData.notice.about}
            </li>

            <li>
              <strong>Job Location:</strong> {formData.notice.location}
            </li>

            <li>
              <strong>Deadline to Register:</strong>{" "}
              {formatDeadlineSentence(formData.notice.deadline)}
              {formData.notice.company_registration_link && (
                <>
                  <br />
                  <strong>Registration Link:</strong>{" "}
                  <a
                    href={formData.notice.company_registration_link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {formData.notice.company_registration_link}
                  </a>
                </>
              )}
            </li>

            <li>
              <strong>Note:</strong> {formData.notice.note}
            </li>
          </ol>
        </div>

        <div className="notice-bottom">
          <div className="notice-copyto">
            <p>
              <strong>Copy to:</strong>
            </p>
            <ul>
              <li>Principal</li>
              <li>Vice-Principal</li>
              <li>All Deans</li>
              <li>All HODs</li>
              <li>Website</li>
              <li>notice Board of TCET</li>
            </ul>
          </div>

          <div className="notice-signature">
            <p>Sd/-</p>
            <p>(Dr. Zahir Aalam)</p>
            <p>Dean (TP&IL)</p>
          </div>
        </div>

        {/* TCET Footer */}
        <img src={noticeFooter} alt="Footer" className="footer-image" />
      </div>
    </div>
  );
});

export default notice;

