// NoticePreview.tsx
import React from "react";
import headerImage from "@/assets/tcet header.png";
import copytoimage from "@/assets/pmt-placement_drive_copytoImage.png";

interface FormData {
  srNo: string;
  sender: string;
  senderAddLine1: string;
  senderAddLine2: string;
  senderAddLine3: string;
  senderAddLine4: string;
  receiver: string;
  receiverAddLine1: string;
  receiverAddLine2: string;
  receiverAddLine3: string;
  receiverAddLine4: string;
  subject: string;
  date: string;
  Note: string;
  From: string;
  From_designation: string;
  content?: string;
}

const NoticePreview = React.forwardRef<HTMLDivElement, { formData: FormData }>(
  ({ formData }, ref) => {
    return (
      <div ref={ref} className="bg-white p-8 text-black">
        <img src={headerImage} alt="Header" className="w-full mb-6" />

        <h2 className="text-center text-2xl font-bold mb-6">NOTICE</h2>

        <div className="flex justify-between mb-6">
          <p>
            <strong>Serial No:</strong> {formData.srNo}
          </p>
          <p>
            <strong>Date:</strong> {formData.date}
          </p>
        </div>

        <table className="w-full mb-8">
          <tbody>
            <tr>
              <td className="w-1/2 align-top">
                <strong>From:</strong>
                <table>
                  <tbody className="text-[12px]">
                    <tr>
                      <td>{formData.sender}</td>
                    </tr>
                    <tr>
                      <td>{formData.senderAddLine1}</td>
                    </tr>
                    <tr>
                      <td>{formData.senderAddLine2}</td>
                    </tr>
                    <tr>
                      <td>{formData.senderAddLine3}</td>
                    </tr>
                    <tr>
                      <td>{formData.senderAddLine4}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
              <td className="w-1/2 align-top">
                <strong>To:</strong>
                <table>
                  <tbody>
                    <tr>
                      <td>{formData.receiver}</td>
                    </tr>
                    <tr>
                      <td>{formData.receiverAddLine1}</td>
                    </tr>
                    <tr>
                      <td>{formData.receiverAddLine2}</td>
                    </tr>
                    <tr>
                      <td>{formData.receiverAddLine3}</td>
                    </tr>
                    <tr>
                      <td>{formData.receiverAddLine4}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mb-6">
          <p>
            <strong>Subject:</strong> {formData.subject}
          </p>
        </div>

        <div
          className="min-h-[100px]"
          dangerouslySetInnerHTML={{ __html: formData.content || "" }}
        />

        <div>
          <p>
            <strong>Note:</strong> {formData.Note}
          </p>
        </div>

        <div className="text-right ">
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

export default NoticePreview;
