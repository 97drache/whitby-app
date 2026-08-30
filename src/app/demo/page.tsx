import WhitbyApp from "@/components/WhitbyApp";
import { SAMPLE_SHEET } from "@/lib/types";

export default function DemoPage() {
  return <WhitbyApp initialSheet={SAMPLE_SHEET} />;
}
