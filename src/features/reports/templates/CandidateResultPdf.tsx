import {
  Document,
  Image,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 8, fontFamily: "Helvetica-Bold" },
  heading: {
    fontSize: 12,
    marginTop: 12,
    marginBottom: 5,
    fontFamily: "Helvetica-Bold",
  },
  subtitle: { fontSize: 14, marginBottom: 15 },
  row: { flexDirection: "row", marginBottom: 6 },
  label: { width: 155, color: "#444" },
  value: { flex: 1 },
  footer: { marginTop: 24, fontSize: 9 },
  qr: { width: 90, height: 90, marginVertical: 8 },
});

type ReportDocumentProps = {
  title: string;
  examTitle: string;
  rows: { label: string; value: string }[];
  sections?: { title: string; rows: { label: string; value: string }[] }[];
  date: Date;
  verification?: { id: string; url: string; qr: string };
};

const ReportRows = ({ rows }: Pick<ReportDocumentProps, "rows">) =>
  rows.map(({ label, value }) => (
    <View key={label} style={styles.row} wrap={false}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  ));

export const CandidateResultDocument = ({
  title,
  examTitle,
  rows,
  sections = [],
  date,
  verification,
}: ReportDocumentProps) => (
  <Document title={title} creationDate={date} modificationDate={date}>
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{examTitle}</Text>
      <ReportRows rows={rows} />
      {sections.map((section) => (
        <View key={section.title}>
          <Text style={styles.heading}>{section.title}</Text>
          <ReportRows rows={section.rows} />
        </View>
      ))}
      {verification && (
        <View style={styles.footer} wrap={false}>
          <Text>Report identifier {verification.id}</Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf image with adjacent verification link */}
          <Image src={verification.qr} style={styles.qr} />
          <Link src={verification.url}>{verification.url}</Link>
        </View>
      )}
    </Page>
  </Document>
);
