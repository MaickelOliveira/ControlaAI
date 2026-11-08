import UiIcon from "@/components/UiIcon";
import s from "./plan-link.module.css";

export default function PlanLink() {
  return (
    <a className={s.link} href="#planos">
      Ver planos <UiIcon name="arrow" />
    </a>
  );
}
