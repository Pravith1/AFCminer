'''the below implementation needs modified adjacency matrix as input in which if i and j share an edge matrix[i][j]=1 and 
if i==j then also matrix[i][j]=1 and if i and j doesnt share an edge then matric[i][j]=0
'''


#the following fucntion implementation is not directly given in the paper so its implemented with the idea of intent
def find_intent(ori_intent,extent,C):
    to_remove=set()
    for j in extent:
        for i in ori_intent:
            if C[i][j]==0:
                to_remove.add(i)
    return ori_intent-to_remove
#the following function is not directly given in the paper so its implemented with the idea of extent
def find_extent(intent,ori_extent,C):
    to_remove=set()
    for i in intent:
        for j in ori_extent:
            if C[i][j]==0:
                to_remove.add(j)
    return ori_extent-to_remove
#the following function iteratively finds the next valid concept from the previous basic concept
#it takes the initial basic conocept whose extent is of single node for example node 2's extent was {1,2,3}
#so now this function takes the intersection of two nodes extent then now it explores two nodes
#then it takes intersection of the concepts generated through two nodes intersection which can give 4 and 3 node concepts
#Its an BFS technically for which the visited is conceptset and the everytime the next level of the tree is stored in next_concept for exploring
# lets see how level by level its explored
# level 1:(1) (2) (3) (4)
# level 2:(1,2) (1,3) (1,4) (2,3) (2,4) (3,4)
# level 3:(1,2,3) (1,2,4) (1,3,4) (1,2,3,4)
#But not all the combination is explored as two nodes may never share any node and the path can be pruned
#for example if 1,2 doesnt have common node then 1,2,3 and 1,2,4 cant exist and as we use conceptset as visited 
#we wont explore same path second time
def AddConcept(C,conceptset):
    #this cur is the same variable conceptset' in the paper and this stores the current level of nodes
    cur_concept=set(conceptset)
    #the nex is the same variable conceptset'' in the paper and is used to store next level of exploration
    next_concept=set()
    #using two loops to get pair of concepts from the cur
    while cur_concept:
        for x1,y1 in cur_concept:
            for x2,y2 in cur_concept:
                if (x1,y1)==(x2,y2):continue
                y=y1 & y2
                if not y:continue
                full_objects = set(range(len(C)))
                extent=frozenset(find_extent(y,full_objects,C))
                intent=frozenset(find_intent(full_objects,extent,C))
                if (extent,intent) not in conceptset:
                    conceptset.add((extent,intent))
                    next_concept.add((extent,intent))
        cur_concept=next_concept
        next_concept=set()
    return conceptset
#this function is used to find the initial basic concept
#lets understand this with an example now a graph has four nodes 0 1 2 3
#and the modified adjacency matrix is
#[1 0 1 1]
#[0 1 1 1]
#[1 1 1 0]
#[1 1 0 1]
#for j=2 we will first find the extent of 2 which is just the nodes 2 is connected to so extent={1,2,3}
#now then we find the intent for {1,2,3} which is {2} so one of the basic concept is ({1,2,3},{2})
def BasicConcept(C):
    conceptset=set()
    full_objects={i for i in range(len(C))}
    #here two loops arent used as in the paper cause the two loops in paper is meant to 
    #understand the timecomplexity as V^2 but here its replaced by one loop.
    #The paper uses (cij(intent) , cij) but cij value is 1 or 0 based on the connectivity.
    # In the paper cij refers to extent of either i or j so its implemented with single loop but still its V^2 because
    # we are finding extent which time complexity is V.  
    for j in range(len(C)):
        extent=frozenset(find_extent({j},full_objects,C))
        intent=frozenset(find_intent(full_objects,extent,C))
        if (extent,intent) not in conceptset:
            conceptset.add((extent,intent))
    return conceptset


def ConceptBuilder(Matrix):
    conceptset=BasicConcept(Matrix)
    AddConcept(Matrix,conceptset)
    return conceptset

sample_matrix = [
    [1, 1, 1, 0, 0],  
    [1, 1, 1, 0, 0],  
    [1, 1, 1, 1, 0],  
    [0, 0, 1, 1, 1],  
    [0, 0, 0, 1, 1],  
]

# Run your ConceptBuilder
concepts = ConceptBuilder(sample_matrix)

# Print the generated concepts nicely
print(f"Total Concepts Found: {len(concepts)}\n")
print(f"{'Extent (Objects)':<25} | {'Intent (Attributes)':<25}")
print("-" * 55)

for extent, intent in sorted(concepts, key=lambda c: len(c[0])):
    extent_str = "{" + ", ".join(map(str, sorted(extent))) + "}"
    intent_str = "{" + ", ".join(map(str, sorted(intent))) + "}"
    print(f"{extent_str:<25} | {intent_str:<25}")