import headerImage from "@/assets/tcet header.png";

import copytoimage from "@/assets/pmt-placement_drive_copytoImage.png";
import "./notice.css";
import { forwardRef } from "react";
import "../../DutyChart.css";
interface TableRow {
  BatchNo: string;
  Date: string;
  Time: string;
  Program: string;
  TopicsToRevise: string;
}

interface FormData {
  srNo: string;
  date: string;
  to: string;
  subject: string;
  Intro: string;
  Note: string;
  tableData: TableRow[];
  From: string;
  From_designation: string;
}

const Notice = forwardRef<HTMLDivElement, { formData: FormData }>(
  ({ formData }, ref) => {
    return (
      <div ref={ref}>
        <img src={headerImage} alt="Header" />
        <h2 className="content-header">NOTICE</h2>
        <div className="flex-container">
          <p>
            <strong>Serial No:</strong> {formData.srNo}
          </p>
          <p>
            <strong>Date:</strong> {formData.date}
          </p>
        </div>
        <p className="text-black">
          <strong>To:</strong> {formData.to}
        </p>
        <p className="text-black">
          <strong>Subject:</strong> {formData.subject}
        </p>
        <p className="text-black">
          <strong>Intro:</strong> {formData.Intro}
        </p>
        <p className="text-black">
          <strong>Note:</strong> {formData.Note}
        </p>
        <table>
          <thead>
            <tr>
              <th>Batch No</th>
              <th>Date</th>
              <th>Time</th>
              <th>Program</th>
              <th>Topics to Revise</th>
            </tr>
          </thead>
          <tbody>
            {formData.tableData.map((row) => (
              <tr>
                <td>{row.BatchNo}</td>
                <td>{row.Date}</td>
                <td>{row.Time}</td>
                <td>{row.Program}</td>
                <td>{row.TopicsToRevise}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="fromto">
          <p>{formData.From}</p>
          <p>{formData.From_designation}</p>
        </div>
        <img src={copytoimage} alt="Footer" className="footerImage" />
      </div>
    );
  }
);

export default Notice;
