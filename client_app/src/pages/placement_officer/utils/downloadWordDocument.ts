import { 
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, TableLayoutType, TabStopType, Header, ExternalHyperlink,
    ImageRun, AlignmentType
} from "docx";
import noticeHeader from "@/assets/tcet header.png";
import copytoimage from "@/assets/pmt-placement_drive_copytoImage.png";
import { saveAs } from "file-saver";
import { BASE_URL } from "@/constant";

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

const downloadWordDocument = async (noticeData: any, isPlacement=true) => {
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
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: "NOTICE", bold: true, size: 36 })],
                        }),

                        new Paragraph({
                            tabStops: [{ type: TabStopType.RIGHT, position: 10000 }],
                            children: [
                                new TextRun({ text: "Serial No: ", bold: true, size: 24 }),
                                new TextRun({ text: `${noticeData.srNo}`, size: 24 }),
                                new TextRun({ text: "\tDate: ", bold: true, size: 24 }),
                                new TextRun({ text: `${noticeData.date}`, size: 24 }),
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
                                    new TextRun({ text: `${label}: `, bold: true, size: 24 }),
                                    new TextRun({ text: value, size: 24 }),
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
                                            children: [new Paragraph({ children: [new TextRun({ text: "Type", bold: true })] })],
                                        }),
                                        new TableCell({
                                            width: { size: 33, type: WidthType.PERCENTAGE },
                                            children: [new Paragraph({ children: [new TextRun({ text: "CTC", bold: true })] })],
                                        }),
                                        new TableCell({
                                            width: { size: 34, type: WidthType.PERCENTAGE },
                                            children: [new Paragraph({ children: [new TextRun({ text: "Position", bold: true })] })],
                                        }),
                                    ],
                                }),
                                ...noticeData.tableData.map((row: TableRowData) =>
                                    new TableRow({
                                        children: [
                                            new TableCell({ children: [new Paragraph({ text: row.type })] }),
                                            new TableCell({ children: [new Paragraph({ text: String(row.salary) })] }),
                                            new TableCell({ children: [new Paragraph({ text: row.position })] }),
                                        ],
                                    })
                                ),
                            ],
                            layout: TableLayoutType.AUTOFIT,
                        }),

                        new Paragraph({ text: "", spacing: { after: 200 } }),
                        
                         ...[
                                                         ["Documents to Carry", noticeData.Documents_to_Carry],
                                                         ["Walk-in Interview", noticeData.Walk_in_interview],
                                                         ["Company Registration Link", noticeData.Company_registration_Link],
                                                         [
                                                             "College Registration Link",
                                                             new ExternalHyperlink({
                                                                 link: `${BASE_URL}/student/${isPlacement ? "placement" : "internship"}/registration/${noticeData.CompanyId}`,
                                                                 children: [new TextRun({ text: `${BASE_URL}/student/${isPlacement ? "placement" : "internship"}/registration/${noticeData.CompanyId}`, style: "Hyperlink" })],
                                                             }),
                                                         ],
                                                         ["Note", noticeData.Note],
                                                     ].map(([label, value]) =>
                                                         new Paragraph({
                                                             children: [
                                                                 new TextRun({ text: `${label}: `, bold: true, size: 24 }),
                                                                 ...(typeof value === "string" ? [new TextRun({ text: value, size: 24 })] : [value]),
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
                                                                                    new TextRun({ text: noticeData.From, size: 36, bold: true }),
                                                                                ],
                                                                            }),
                                                                            new Paragraph({
                                                                                alignment: AlignmentType.RIGHT,
                                                                                children: [
                                                                                    new TextRun({ text: noticeData.From_designation, size: 36 }),
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
