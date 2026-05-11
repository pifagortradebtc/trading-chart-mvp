import { redirect } from "next/navigation";

/** Стартовая страница — бэктест DCA. */
export default function Home() {
  redirect("/backtest");
}
