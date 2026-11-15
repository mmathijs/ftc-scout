export type Doc<Data, Variables> = {
    name: string;
    kind: "query" | "mutation" | "subscription";
    hash: string;
    query: string;
    __types?: (v: Variables) => Data;
};
