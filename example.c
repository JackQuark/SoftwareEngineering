#include<stdio.h>
#include<stdlib.h>
#include<limits.h>
#define inf 100000000
//use bellman-ford to prevent the negative cycle
struct edge{
      int st;//start
      int ed;//end
      int w;//weight
      struct edge* next;
};
int add_node(int *n){
      (*n)++;
      return *n;
}
int delete_node(int *n,int c,struct edge* cur,struct edge** tail){
      (*n)--;
      if(cur==NULL)return 0;
      while(cur->next!=NULL){
            if( cur->next->st==c || cur->next->ed==c){
                  struct edge* tmp = cur->next;
                  cur->next = cur->next->next;
                  free(tmp);
            }else{
                  if(cur->next->st>c)cur->next->st--;
                  if(cur->next->ed>c)cur->next->ed--;
                  cur = cur->next;
            }
      }
      *tail = cur;
      return 0;
}
void add_edge(int a,int b,int c,struct edge** tail){
      (*tail)->next = (struct edge*)malloc(sizeof(struct edge));
      (*tail) = (*tail) -> next;
      (*tail)->st = a;
      (*tail)->ed = b;
      (*tail)->w = c;
      (*tail)->next = NULL;
      return;
}
void delete_edge(int a, int b, int c,struct edge* cur,struct edge** tail){
      if(cur==NULL)return;
      while(cur->next!=NULL){
            if( cur->next->st==a && cur->next->ed==b && cur->next->w==c){
                  struct edge* tmp = cur->next;
                  cur->next = cur->next->next;
                  free(tmp);
                  break;
            }
            cur = cur->next;
      }
      *tail = cur;
      return;
}
int bellman_ford(int n,struct edge* head,int a,int* da){
      for(int i = 1;i<=n;i++){
            da[i] = inf;
      }
      if(a<1 || a>n)return 0;
      da[a] = 0;
      for(int i = 1;i<=n;i++){
            struct edge* cur = head->next;
            int relax = 0;
            while(cur!=NULL){
                  if(da[cur->st]!=inf && da[cur->st]+cur->w<da[cur->ed]){
                        if(i==n)return 0;
                        da[cur->ed]=da[cur->st]+cur->w;
                        relax=1;
                  }
                  cur=cur->next;
            }
            if(relax==0)break;
      }
      return 1;
}
int reverse_bellman_ford(int n,struct edge* head,int b,int* db){
      for(int i = 1;i<=n;i++){
            db[i] = inf;
      }
      if(b<1 || b>n)return 0;
      db[b] = 0;
      for(int i = 1;i<=n;i++){
            struct edge* cur = head->next;
            int relax = 0;
            while(cur!=NULL){
                  if(db[cur->ed]!=inf && db[cur->ed]+cur->w<db[cur->st]){
                        if(i==n)return 0;
                        db[cur->st]=db[cur->ed]+cur->w;
                        relax=1;
                  }
                  cur=cur->next;
            }
            if(relax==0)break;
      }
      return 1;
}
int main(){
      int n = 0;//number of node
      struct edge* head = (struct edge*)malloc(sizeof(struct edge));
      head->next = NULL;
      struct edge* tail = head;
      int op,a,b,c;//0:new 
      int q=0;//questionable?
      int *da=NULL,*db=NULL;
      while(scanf("%d",&op)!=EOF){
            if(op==0){
                  q=0;
                  add_node(&n);
            }else if(op==1){
                  q=0;
                  scanf("%d",&c);
                  delete_node(&n,c,head,&tail);
            }else if(op==2){
                  q=0;
                  scanf("%d%d%d",&a,&b,&c);
                  add_edge(a,b,c,&tail);
            }else if(op==3){
                  q=0;
                  scanf("%d%d%d",&a,&b,&c);
                  delete_edge(a,b,c,head,&tail);
            }else if(op==4){
                  scanf("%d%d",&a,&b);
                  if (da != NULL)free(da);
                  if (db != NULL)free(db);
                  da = (int*)malloc((n+2)*sizeof(int));
                  db = (int*)malloc((n+2)*sizeof(int));
                  q = 1*bellman_ford(n,head,a,da);
                  q*=reverse_bellman_ford(n,head,b,db);
                  if(q==0)printf("negative cycle EXIST or invalid input!\n");
            }else if(op==5){
                  if(q==0){
                        printf("Please run bellman_ford(op4) first.\n");
                  }else{
                        scanf("%d",&c);
                        printf("The shortest path from %d to %d through %d is %d.\n",a,b,c,da[c]+db[c]);
                  }
            }
      }
}
