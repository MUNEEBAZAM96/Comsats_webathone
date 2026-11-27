import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 8, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 12, marginBottom: 20, color: "#444" },
  row: { flexDirection: "row", marginBottom: 6 },
  label: { width: 140, color: "#555" },
  value: { flex: 1 },
  footer: { marginTop: 40, fontSize: 9, color: "#777" },
});

export type CandidateResultPdfProps = {
  examTitle: string;
  candidateLabel: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  submittedAt: string | null;
  publishedAt: string;
  reportId: string;
};

export const CandidateResultDocument = ({
  examTitle,
  candidateLabel,
  totalScore,
  maxScore,
  percentage,
  submittedAt,
  publishedAt,
  reportId,
}: CandidateResultPdfProps) => (
  <Document>
    <Page
      size="A4"
      style={styles.page}>
      <Text style={styles.title}>Examination Result Report</Text>
      <Text style={styles.subtitle}>{examTitle}</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Candidate</Text>
        <Text style={styles.value}>{candidateLabel}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Score</Text>
        <Text style={styles.value}>
          {totalScore} / {maxScore} ({percentage}%)
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Submitted</Text>
        <Text style={styles.value}>{submittedAt ?? "—"}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Published</Text>
        <Text style={styles.value}>{publishedAt}</Text>
      </View>
      <Text style={styles.footer}>
        Report ID: {reportId}. Verify authenticity at the institution portal.
      </Text>
    </Page>
  </Document>
);
