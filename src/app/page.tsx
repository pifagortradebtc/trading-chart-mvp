import { redirect } from "next/navigation";

/** По умолчанию открываем страницу бэктеста DCA. Демо-график: `/chart`. */
export default function Home() {
  redirect("/backtest");
}
