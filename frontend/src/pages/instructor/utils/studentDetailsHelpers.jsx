import { Box, Typography } from "@mui/material";

/**
 * Format messages for plain-text PDF export.
 * Returns a newline-separated string of "Sender: message" lines.
 */
export function formatMessagesForPDF(messages, studentName, patientName) {
  // Simple deduplication by content
  const seen = new Set();
  const uniqueMessages = messages.filter((msg) => {
    const key = msg.message_content.trim();
    if (key.includes("Begin the conversation as the patient")) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return uniqueMessages
    .map(
      (msg) =>
        `${msg.student_sent ? `${studentName} (Student)` : `${patientName} (LLM)`}: ${msg.message_content.trim()}`
    )
    .join("\n");
}

/**
 * Format session notes for plain-text PDF export.
 */
export function formatNotesForPDF(notes) {
  return `Notes: ${notes || "No notes taken."}`;
}

/**
 * Format messages as styled JSX for on-screen display.
 * Groups messages by date and returns an array of React elements.
 */
export function formatMessages(messages, studentName, patientName) {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid Date";
    return date
      .toLocaleDateString(undefined, {
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
      })
      .replace(/\//g, "-");
  };

  // Simple deduplication by content
  const seen = new Set();
  const uniqueMessages = messages.filter((message) => {
    const key = message.message_content.trim();
    if (key.includes("Begin the conversation as the patient")) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const groupedMessages = uniqueMessages.reduce((acc, message) => {
    const date = formatDate(message.time_sent);
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(message);
    return acc;
  }, {});

  return Object.keys(groupedMessages).map((date) => (
    <Box key={date} sx={{ my: 2 }}>
      <Typography variant="body2" sx={{ fontWeight: "bold", mb: 1 }}>
        {date}
      </Typography>
      {groupedMessages[date].map((message, idx) => (
        <Box
          key={idx}
          sx={{
            backgroundColor: message.student_sent ? "lightgreen" : "lightblue",
            borderRadius: 2,
            p: 1,
            mb: 1,
            maxWidth: "80%",
            alignSelf: message.student_sent ? "flex-end" : "flex-start",
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: "bold" }}>
            {message.student_sent ? `${studentName} (Student)` : `${patientName} (LLM)`}
          </Typography>
          <Typography variant="body1">{message.message_content.trim()}</Typography>
        </Box>
      ))}
    </Box>
  ));
}
