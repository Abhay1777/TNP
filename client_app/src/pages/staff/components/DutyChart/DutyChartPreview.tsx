import React from "react";
import headerImage from "@/assets/tcet header.png";
import copytoimage from "@/assets/pmt-placement_drive_copytoImage.png";

interface FormData {
  srNo: string;
  to: string;
  subject: string;
  date: string;
  Intro: string;
  Note: string;
  From: string;
  From_designation: string;
}

interface TableRow {
  srNo: string;
  name: string;
  designation: string;
  department: string;
  reportingTime: string;
  roles: string;
  signature: string;
}
interface PreviewProps {
  formData: FormData;
  tableData: TableRow[];
}

export const DutyChartPreview = React.forwardRef<HTMLDivElement, PreviewProps>(
  ({ formData, tableData }, ref) => {
    return (
      <div ref={ref} className="bg-white p-8">
        <img src={headerImage} alt="Header" className="w-full mb-6" />

        <h2 className="text-center text-2xl font-bold mb-6">NOTICE</h2>

        <div className="flex justify-between mb-4">
          <p>
            <strong>Serial No:</strong> {formData.srNo}
          </p>
          <p>
            <strong>Date:</strong> {formData.date}
          </p>
        </div>

        <div className="mb-4">
          <p>
            <strong>To:</strong> {formData.to}
          </p>
          <p>
            <strong>Subject:</strong> {formData.subject}
          </p>
          <p>
            <strong>Intro:</strong> {formData.Intro}
          </p>
        </div>

        <table className="w-full border-collapse border mb-4">
          <thead>
            <tr>
              {Object.keys(tableData[0]).map((header) => (
                <th key={header} className="border p-2">
                  {header.replace(/_/g, " ").toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.map((row, index) => (
              <tr key={index}>
                {Object.values(row).map((value, i) => (
                  <td key={i} className="border p-2">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mb-4">
          <strong>Note:</strong> {formData.Note}
        </p>

        <div className="text-right">
          <p>{formData.From}</p>
          <p>{formData.From_designation}</p>
        </div>

        <img
          src={copytoimage}
          alt="Footer"
          className="max-w-[100%] object-contain h-auto"
        />
      </div>
    );
  }
);

export default DutyChartPreview;
