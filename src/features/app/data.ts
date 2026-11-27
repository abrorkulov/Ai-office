"use client";

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type Json } from "@/shared/api";
import type * as S from "@/server/modules/staff";
import type * as W from "@/server/modules/work";
import type * as A from "@/server/modules/accounts";
import type * as I from "@/server/modules/insights";
import type * as K from "@/server/modules/knowledge";
import type { Auth } from "@/server/security/session";

type Out<F extends (...a: never[]) => Promise<unknown>> = Json<Awaited<ReturnType<F>>>;
export type Me = Omit<Auth, "sessionId"> & { orgs: Out<typeof A.myOrgs> };
export type Card = S.StaffCard;
export type StaffFull = Out<typeof S.getStaff>;
export type Chat = Out<typeof S.chatHistory>;
export type Run = Out<typeof S.staffRuns>[number];
export type FeedItem = Out<typeof S.staffFeed>[number];
export type Task = Out<typeof W.listTasks>[number];
export type Approval = Out<typeof W.listApprovals>[number];
export type Contact = Out<typeof W.listContacts>[number];
export type Deal = Out<typeof W.listDeals>[number];
export type Connection = Out<typeof W.listConnections>[number];
export type Monitor = Out<typeof W.listMonitors>[number];
export type Overview = Out<typeof W.overview>;
export type People = Out<typeof A.orgPeople>;
export type Notes = Out<typeof W.taskNotes>;
export type Dev = Out<typeof W.devBoard>;
export type Sprint = Out<typeof I.listSprints>[number];
export type DocRow = Out<typeof K.listDocs>[number];
export type Doc = Out<typeof K.getDoc>;

const LIVE = 4000;
const get = <T,>(key: QueryKey, path: string, every?: number, enabled = true) => ({ queryKey: key, queryFn: () => api.get<T>(path), refetchInterval: every, enabled });

export const useMe = () => useQuery(get<Me>(["me"], "/me", 60_000));
export const useStaff = () => useQuery(get<Card[]>(["staff"], "/staff", LIVE));
export const useStaffOne = (id: string) => useQuery(get<StaffFull>(["staff", id], `/staff/${id}`, LIVE * 2));
export const useChat = (id: string) => useQuery(get<Chat>(["chat", id], `/staff/${id}/chat`, 2500));
export const useRuns = (id: string) => useQuery(get<Run[]>(["runs", id], `/staff/${id}/runs`, LIVE));
export const useFeed = (id?: string) => useQuery(get<FeedItem[]>(["feed", id ?? ""], `/feed${id ? `?staff=${id}` : ""}`, LIVE * 2));
export const useTasks = (staff?: string) => useQuery(get<Task[]>(["tasks", staff ?? ""], `/tasks${staff ? `?staff=${staff}` : ""}`, LIVE));
export const useApprovals = (staff?: string) => useQuery(get<Approval[]>(["approvals", staff ?? ""], `/approvals${staff ? `?staff=${staff}` : ""}`, LIVE));
export const useContacts = (q: string) => useQuery({ ...get<Contact[]>(["contacts", q], `/contacts?q=${encodeURIComponent(q)}`), placeholderData: (p: Contact[] | undefined) => p });
export const useDeals = () => useQuery(get<Deal[]>(["deals"], "/deals", LIVE * 3));
export const useConnections = (on = true) => useQuery(get<Connection[]>(["connections"], "/connections", undefined, on));
export const useMonitors = (staff?: string) => useQuery(get<Monitor[]>(["monitors", staff ?? ""], `/monitors${staff ? `?staff=${staff}` : ""}`, 15_000));
export const useDocs = (q: string) => useQuery({ ...get<DocRow[]>(["docs", q], `/docs?q=${encodeURIComponent(q)}`), placeholderData: (p: DocRow[] | undefined) => p });
export const useDoc = (id: string | null) => useQuery(get<Doc>(["doc", id ?? ""], `/docs/${id}`, undefined, !!id));
export const useOverview = () => useQuery(get<Overview>(["overview"], "/overview", LIVE * 2));
export const useNotes = (id: string) => useQuery(get<Notes>(["notes", id], `/tasks/${id}/notes`, 6000));
export const useSprints = () => useQuery(get<Sprint[]>(["sprints"], "/sprints", 20_000));
export const useDev = () => useQuery(get<Dev>(["dev"], "/dev", 15_000));
export const usePeople = () => useQuery(get<People>(["people"], "/org/people"));

/** Действие: ошибку показываем сразу, списки обновляем. */
export function useAction<V = void, R = unknown>(fn: (v: V) => Promise<R>, o: { done?: string | ((r: R, v: V) => void); refresh?: string[]; silent?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      if (typeof o.done === "string") toast.success(o.done);
      else o.done?.(r, v);
      const keys = o.refresh;
      void qc.invalidateQueries(keys ? { predicate: (q) => keys.includes(String(q.queryKey[0])) } : undefined);
    },
    onError: (e) => {
      if (!o.silent) toast.error(e.message);
    },
  });
}
