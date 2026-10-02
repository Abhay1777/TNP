import { 
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, TableLayoutType, TabStopType, Header,
    ImageRun, AlignmentType
} from "docx";
import noticeHeader from "@/assets/tcet header.png";
import copytoimage from "@/assets/pmt-placement_drive_copytoImage.png";
import { saveAs } from "file-saver";

interface TableRowData { 
    type: string;
    salary: string; 
    position: string;
}

const getBase64 = async (imagePath: string): Promise<Uint8Array> => {
    const response = await fetch(imagePath); 
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(blob);
        reader.onloadend = () => {
            if (reader.result) {
                resolve(new Uint8Array(reader.result as ArrayBuffer));
            } else {
                reject(new Error("Failed to convert image to Base64"));
            }
        };
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

const downloadWordDocument = async (noticeData: any, _isPlacement = true) => {
    try {
        const headerImageData = await getBase64(noticeHeader);
        const footerImageData = await getBase64(copytoimage);

        const doc = new Document({
            sections: [
                {
                    headers: {
                        default: new Header({
                            children: [
                                new Paragraph({
                                    alignment: AlignmentType.CENTER,
                                    children: [
                                        new ImageRun({
                                            data: headerImageData,
                                            transformation: {width: 600, height: 120},
                                            type: "png",
                                        }),
                                    ],
                                }), 
                            ],
                        }),
                    },
                    children: [
                        new Paragraph({
                            tabStops: [{ type: TabStopType.RIGHT, position: 10000 }],
                            children: [
                                new TextRun({ text: "TCET/FRM/MP-04/11", bold: true, size: 24, font: "Arial" }),
                                new TextRun({ text: "\tRevision: B", bold: true, size: 24, font: "Arial" }),
                            ],
                        }),

                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: "Training and Placement Cell", bold: true, size: 26, font: "Arial" })],
                        }),

                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: "NOTICE", bold: true, size: 36, font: "Arial" })],
                        }),

                        new Paragraph({
                            tabStops: [{ type: TabStopType.RIGHT, position: 10000 }],
                            children: [
                                new TextRun({ text: "Sr. No: ", bold: true, size: 24, font: "Arial" }),
                                new TextRun({ text: `${noticeData.srNo}`, size: 24, font: "Arial" }),
                                new TextRun({ text: "\tDate: ", bold: true, size: 24, font: "Arial" }),
                                new TextRun({ text: `${noticeData.date}`, size: 24, font: "Arial" }),
                            ],
                        }),

                        new Paragraph({ text: "", spacing: { after: 200 } }),

                        ...[
                            ["To", noticeData.to],
                            ["Subject", noticeData.subject],
                            ["Intro", noticeData.intro],
                            ["Eligibility Criteria", noticeData.eligibility_criteria],
                            ["About Company", noticeData.about],
                            ["Location", noticeData.location],
                        ].map(([label, value]) =>
                            new Paragraph({
                                children: [
                                    new TextRun({ text: `${label}: `, bold: true, underline: label === "Subject" ? { type: "single" } : undefined, size: 24, font: "Arial" }),
                                    new TextRun({ text: value || "", underline: label === "Subject" ? { type: "single" } : undefined, size: 24, font: "Arial" }),
                                ],
                            })
                        ),

                        new Paragraph({ text: "", spacing: { after: 200 } }),

                        new Table({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            rows: [
                                new TableRow({
                                    children: [
                                        new TableCell({
                                            width: { size: 33, type: WidthType.PERCENTAGE },
                                            children: [new Paragraph({ children: [new TextRun({ text: "Type", bold: true, font: "Arial" })] })],
                                        }),
                                        new TableCell({
                                            width: { size: 33, type: WidthType.PERCENTAGE },
                                            children: [new Paragraph({ children: [new TextRun({ text: "CTC", bold: true, font: "Arial" })] })],
                                        }),
                                        new TableCell({
                                            width: { size: 34, type: WidthType.PERCENTAGE },
                                            children: [new Paragraph({ children: [new TextRun({ text: "Position", bold: true, font: "Arial" })] })],
                                        }),
                                    ],
                                }),
                                ...noticeData.tableData.map((row: TableRowData) =>
                                    new TableRow({
                                        children: [
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.type, font: "Arial" })] })] }),
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(row.salary), font: "Arial" })] })] }),
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.position, font: "Arial" })] })] }),
                                        ],
                                    })
                                ),
                            ],
                            layout: TableLayoutType.AUTOFIT,
                        }),

                        new Paragraph({ text: "", spacing: { after: 200 } }),
                        
                        ...[
                            ["Documents to Carry", noticeData.Documents_to_Carry],
                            ["Selection Process", noticeData.Walk_in_interview],
                            ["Deadline to Register", formatDeadlineSentence(noticeData.deadline)],
                            ...(noticeData.Company_registration_Link ? [["Registration Link", noticeData.Company_registration_Link]] : []),
                            ["Note", noticeData.Note],
                        ].map(([label, value]) =>
                            new Paragraph({
                                children: [
                                    new TextRun({ text: `${label}: `, bold: true, size: 24, font: "Arial" }),
                                    ...(typeof value === "string" ? [new TextRun({ text: value, size: 24, font: "Arial" })] : [value]),
                                ],
                            })
                        ),                          

                        new Paragraph({ text: "", spacing: { after: 200 } }),

                        new Table({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            borders: { top: { style: "none" }, bottom: { style: "none" }, left: { style: "none" }, right: { style: "none" }, insideHorizontal: { style: "none" }, insideVertical: { style: "none" } },                                
                            rows: [
                                new TableRow({
                                    children: [
                                        new TableCell({
                                            width: { size: 70, type: WidthType.PERCENTAGE },
                                            children: [
                                                new Paragraph({
                                                    alignment: AlignmentType.LEFT,
                                                    children: [
                                                        new ImageRun({
                                                            data: footerImageData,
                                                            transformation: { width: 350, height: 100 },
                                                            type: "png",
                                                        }), 
                                                    ],
                                                }),
                                            ],
                                        }),
                                        new TableCell({
                                            width: { size: 30, type: WidthType.PERCENTAGE },
                                            children: [
                                                new Paragraph({
                                                    alignment: AlignmentType.RIGHT,
                                                    children: [
                                                        new TextRun({ text: noticeData.From, size: 36, bold: true, font: "Arial" }),
                                                    ],
                                                }),
                                                new Paragraph({
                                                    alignment: AlignmentType.RIGHT,
                                                    children: [
                                                        new TextRun({ text: noticeData.From_designation, size: 36, font: "Arial" }),
                                                    ],
                                                }),
                                            ],
                                        }),
                                    ],
                                }),
                            ],
                            layout: TableLayoutType.FIXED,
                        }),
                    ],
                },
            ],
        });

        const blob = await Packer.toBlob(doc);
        saveAs(blob, "Notice.docx");
    } catch (error) {
        console.error("Error generating Word document:", error);
    }
};

export default downloadWordDocument;
