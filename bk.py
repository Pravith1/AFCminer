from collections import defaultdict
from AFCMiner import FairnessFilter, AttributedConceptsDerivation,WFC_FairnessFilter

def BronKerboschIterative(V_set, adj):
    maximal_cliques = []
    stack = [(set(), set(V_set), set())]

    while stack:
        R, P, X = stack.pop()

        if not P and not X:
            if R:
                maximal_cliques.append(R)
            continue

        if not P:
            continue

        pivot = max(P | X, key=lambda u: len(P & adj[u]))
        candidates = list(P - adj[pivot])

        for v in candidates:
            stack.append((R | {v}, P & adj[v], X & adj[v]))
            P.remove(v)
            X.add(v)

    return maximal_cliques


def BKMiner(V, node_attribute_set, R_input,k=1,delta=1):
    AFC_res = []
    WFC_res=[]
    V_set = set(V)
    attributes = set(node_attribute_set) - V_set
    Count_AFC=defaultdict(int)
    Count_WFC=defaultdict(int)
    Matrix = defaultdict(lambda: defaultdict(int))
    adj = defaultdict(set)
    
    # 1. Self-loops for all nodes
    for v in V_set:
        Matrix[v][v] = 1
        
    # 2. Build graph edges and attribute mappings
    for i, j in R_input:
        Matrix[i][j] = 1
        if i in V_set and j in V_set:
            Matrix[j][i] = 1
            adj[i].add(j)
            adj[j].add(i)
    AFC_maxi=0
    WFC_maxi=0
    # 3. Discover maximal cliques
    maximal_cliques = BronKerboschIterative(V_set, adj)
    for clique in maximal_cliques:
        if FairnessFilter(clique, clique, attributes, Matrix):
            AFC_res.append(clique)
            Count_AFC[len(clique)]+=1
            AFC_maxi=max(len(clique),AFC_maxi)
        else:
            powerset = AttributedConceptsDerivation(clique)
            powerset.sort(key=lambda x: len(x), reverse=True)
            
            cur_maxi = []
            for sub in powerset:
                if not sub:
                    continue
                if any((cur & sub) == sub for cur in cur_maxi):
                    continue
                if FairnessFilter(sub, sub, attributes, Matrix):
                    cur_maxi.append(sub)
                    AFC_res.append(sub) 
                    Count_AFC[len(sub)]+=1
                    AFC_maxi=max(len(sub),AFC_maxi)
        X1=clique
        if WFC_FairnessFilter(X1, attributes, Matrix, k=k, delta=delta):
            WFC_res.append(X1)
            Count_WFC[len(X1)]+=1
            WFC_maxi=max(len(X1),WFC_maxi)
        else:
            powerset = AttributedConceptsDerivation(X1) if 'powerset' not in locals() else powerset
            powerset.sort(key=lambda x: len(x), reverse=True)
            cur_maxi=[]
            for sub in powerset:
                if not sub:
                    continue
                flag=False
                for cur in cur_maxi:
                    if (cur&sub)==sub:
                        flag=True
                        break
                if flag:continue
                if WFC_FairnessFilter(sub, attributes, Matrix, k=k, delta=delta):
                    cur_maxi.append(sub)
                    WFC_res.append(sub)   
                    Count_WFC[len(sub)]+=1    
                    WFC_maxi=max(len(sub),WFC_maxi)
    print(len(AFC_res),len(WFC_res))     
    print(AFC_maxi,WFC_maxi)
    return AFC_res,WFC_res,AFC_maxi,WFC_maxi,Count_AFC,Count_WFC