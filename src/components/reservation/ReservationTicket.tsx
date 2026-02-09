import { useRef, useCallback } from "react";
import { QRCodeCanvas } from "qrcode.react";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { STORE_NAME, STORE_ADDRESS_LINE1, STORE_ADDRESS_LINE3, STORE_PHONE } from "@/lib/constants";

interface ReservationTicketProps {
  reservationCode: string;
  name: string;
  pax: number;
  date: string;
  time: string;
}

export function ReservationTicket({
  reservationCode,
  name,
  pax,
  date,
  time,
}: ReservationTicketProps) {
  const qrRef = useRef<HTMLDivElement>(null);
  
  // Tracking URL with code pre-filled
  const trackingUrl = `https://arwfloridablanca.lovable.app/reserve/track?code=${reservationCode}`;
  
  const generatePDF = useCallback(() => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [100, 180], // Ticket-like dimensions
    });
    
    const pageWidth = 100;
    let y = 10;
    
    // Header background
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, pageWidth, 35, "F");
    
    // Restaurant name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(STORE_NAME, pageWidth / 2, y + 8, { align: "center" });
    
    // Subtitle
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Table Reservation Ticket", pageWidth / 2, y + 16, { align: "center" });
    
    y = 45;
    
    // Get QR code as image
    const qrCanvas = qrRef.current?.querySelector("canvas");
    if (qrCanvas) {
      const qrImage = qrCanvas.toDataURL("image/png");
      doc.addImage(qrImage, "PNG", (pageWidth - 40) / 2, y, 40, 40);
    }
    
    y += 45;
    
    // Reservation code (prominent)
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(reservationCode, pageWidth / 2, y, { align: "center" });
    
    y += 6;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text("RESERVATION CODE", pageWidth / 2, y, { align: "center" });
    
    // Divider
    y += 8;
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.line(10, y, pageWidth - 10, y);
    
    // Guest info
    y += 8;
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Guest:", 10, y);
    doc.setFont("helvetica", "normal");
    doc.text(name, pageWidth - 10, y, { align: "right" });
    
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text("Party Size:", 10, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${pax} ${pax === 1 ? "guest" : "guests"}`, pageWidth - 10, y, { align: "right" });
    
    // Divider
    y += 8;
    doc.line(10, y, pageWidth - 10, y);
    
    // Date and time
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.text("Date:", 10, y);
    doc.setFont("helvetica", "normal");
    doc.text(date, pageWidth - 10, y, { align: "right" });
    
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text("Time:", 10, y);
    doc.setFont("helvetica", "normal");
    doc.text(time, pageWidth - 10, y, { align: "right" });
    
    // Divider
    y += 8;
    doc.line(10, y, pageWidth - 10, y);
    
    // Status
    y += 8;
    doc.setFillColor(254, 243, 199); // amber-100
    doc.roundedRect(10, y - 4, pageWidth - 20, 12, 2, 2, "F");
    doc.setTextColor(180, 83, 9); // amber-700
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("STATUS: PENDING CONFIRMATION", pageWidth / 2, y + 3, { align: "center" });
    
    y += 14;
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("Subject to confirmation. We will contact you.", pageWidth / 2, y, { align: "center" });
    
    // Location section
    y += 10;
    doc.setDrawColor(226, 232, 240);
    doc.line(10, y, pageWidth - 10, y);
    
    y += 6;
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("LOCATION", pageWidth / 2, y, { align: "center" });
    
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text(STORE_NAME, pageWidth / 2, y, { align: "center" });
    y += 4;
    doc.text(STORE_ADDRESS_LINE1, pageWidth / 2, y, { align: "center" });
    y += 4;
    doc.text(STORE_ADDRESS_LINE3, pageWidth / 2, y, { align: "center" });
    y += 4;
    
    // Format phone for display
    const formattedPhone = STORE_PHONE.replace(/(\d{4})(\d{3})(\d{4})/, "$1-$2-$3");
    doc.text(`Tel: ${formattedPhone}`, pageWidth / 2, y, { align: "center" });
    
    // Footer
    y += 10;
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(0, y - 2, pageWidth, 20, "F");
    
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Present this ticket on arrival", pageWidth / 2, y + 4, { align: "center" });
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(6);
    doc.text("Track status: arwfloridablanca.lovable.app/reserve/track", pageWidth / 2, y + 10, { align: "center" });
    
    // Save
    doc.save(`reservation-${reservationCode}.pdf`);
  }, [reservationCode, name, pax, date, time]);

  return (
    <div>
      {/* Hidden QR code for PDF generation */}
      <div ref={qrRef} className="hidden">
        <QRCodeCanvas
          value={trackingUrl}
          size={200}
          level="H"
          includeMargin
        />
      </div>
      
      <Button
        onClick={generatePDF}
        variant="outline"
        className="w-full"
        size="lg"
      >
        <Download className="mr-2 h-4 w-4" />
        Download Reservation Ticket
      </Button>
    </div>
  );
}
