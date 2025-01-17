import Vue from 'vue';
import { ethers } from 'ethers';
import store from '@/store';
//import provider from '@/helpers/provider';
import addresses from '@/helpers/addresses';
import {
  getExchangeRatesFromCoinGecko,
  getPotions,
  getAllowances,
  revitalisePotion,
  withdrawPotion
} from '@/helpers/utils';
import assets from '@/helpers/assets.json';
import { abi as ierc20Abi } from '@/helpers/abi/IERC20.json';
import { abi as OHMPreSale } from '@/helpers/abi/OHMPreSale.json';
import { abi as OlympusStaking } from '@/helpers/abi/OlympusStaking.json';
import { abi as MigrateToOHM } from '@/helpers/abi/MigrateToOHM.json';
import { abi as sOHM } from '@/helpers/abi/sOHM.json';
import { abi as LPStaking } from '@/helpers/abi/LPStaking.json';
import { abi as DistributorContract } from '@/helpers/abi/DistributorContract.json';
import { abi as BondContract } from '@/helpers/abi/BondContract.json';
import { abi as BondCalcContract } from '@/helpers/abi/BondCalcContract.json';
import { abi as PairContract } from '@/helpers/abi/PairContract.json';

import { whitelist } from '@/helpers/whitelist.json';

const parseEther = ethers.utils.parseEther;

let provider;

const ethereum = window['ethereum'];
if (ethereum) {
  ethereum.on('accountsChanged', () => store.dispatch('init'));
  ethereum.on('networkChanged', network => {
    
    store.dispatch('init')     
  });
}

const state = {  
  approval: 0,
  loading: false,
  address: null,
  name: '',
  whitelisted: false,
  balance: 0,
  ohmBalance: 0,
  claim: 0,
  minimumEth: 0,
  providedEth: 0,
  amount: 0,
  remainingEth: 0,
  network: {chainId: 0},
  exchangeRates: {},
  allowance: 0,
  stakeAllowance: 0,
  unstakeAllowance: 0,
  balances: {},
  authorized: false,
  allowanceTx: 0,
  saleTx: 0,
  confirmations: 1,
  allotment: 0,
  maxPurchase: 0,
  maxSwap: 0,
  amountSwap: 0,
};

const mutations = {
  set(_state, payload) {
    Object.keys(payload).forEach(key => {
      Vue.set(_state, key, payload[key]);
    });
  }
};

const actions = {
  init: async ({ commit, dispatch }) => {
    commit('set', { loading: true });
    // @ts-ignore
    if (typeof window.ethereum !== 'undefined') {
      const ethereum = window['ethereum'];
      provider = new ethers.providers.Web3Provider(ethereum);
    }

    if (provider) {
      try {
        const signer = provider.getSigner();
        const address = await signer.getAddress();
        if (address) await dispatch('login');
      } catch (e) {
        console.log(e);
      }
    }
    commit('set', { loading: false });
  },
  login: async ({ commit, dispatch }) => {
    if (provider) {
      try {
        await ethereum.enable();
        provider = new ethers.providers.Web3Provider(ethereum);
        const signer = provider.getSigner();
        const address = await signer.getAddress();
        console.log('error address: '+address);
        // const name = await provider.lookupAddress(address);
        // Throws errors with non ENS compatible testnets
        const network = await provider.getNetwork();
        store.commit('set', { network: network}); 
            
        
        const aOHMContract = await new ethers.Contract(addresses[state.network.chainId].AOHM_ADDRESS, ierc20Abi, provider);
        const aOHMBalanceBeforeDecimals = await aOHMContract.balanceOf( address );
        const aOHMBalance = aOHMBalanceBeforeDecimals / 1000000000;
        
        let ohmContract, ohmBalance=0, allowance=0;
        let sohmContract, sohmMainContract, sohmBalance=0, stakeAllowance=0, unstakeAllowance=0, circSupply=0;
        let stakingContract, profit=0;
        let lpStakingContract, totalLPStaked=0, lpStaked=0, pendingRewards=0, lpStakingAPY;
        let lpContract, lpBalance=0, lpStakeAllowance;
        let distributorContract, stakingAPY=0, stakingRebase=0, stakingReward=0, nextEpochBlock=0, currentBlock=0;
        let distributorContractSigner, currentIndex=0;
        let bondingCalcContract, bondValue=0;
        let bondingContract, vestingTerm=0, marketPrice=0, bondPrice=0, debtRatio=0, lpBondAllowance=0, interestDue=0, principleDeposited=0, bondMaturationBlock=0, bondDiscount;
        let pairContract;
        
        if(whitelist.includes(address)) 
          commit('set', {whitelisted: true})
        
        const daiContract = new ethers.Contract(addresses[network.chainId].DAI_ADDRESS, ierc20Abi, provider);
        const balance = await daiContract.balanceOf(address);
        console.log(balance)
        allowance = await daiContract.allowance(address, addresses[network.chainId].PRESALE_ADDRESS)!;

        if(addresses[network.chainId].BONDINGCALC_ADDRESS) {
          bondingCalcContract = new ethers.Contract(addresses[network.chainId].BONDINGCALC_ADDRESS, BondCalcContract, provider);
          lpContract = new ethers.Contract(addresses[network.chainId].LP_ADDRESS, ierc20Abi, provider);
          
        }  

        
        if(addresses[network.chainId].BOND_ADDRESS) {
          bondingContract = new ethers.Contract(addresses[network.chainId].BOND_ADDRESS, BondContract, provider);
          bondingCalcContract = new ethers.Contract(addresses[network.chainId].BONDINGCALC_ADDRESS, BondCalcContract, provider);
          pairContract = new ethers.Contract(addresses[network.chainId].LP_ADDRESS, PairContract, provider);
          lpContract = new ethers.Contract(addresses[network.chainId].LP_ADDRESS, ierc20Abi, provider);
          ohmContract = new ethers.Contract(addresses[network.chainId].OHM_ADDRESS, ierc20Abi, provider);
          
          lpBalance = await lpContract.balanceOf(address);

          const totalLP = await lpContract.totalSupply();

          const reserves = await pairContract.getReserves();

          bondValue = await bondingContract.calculateBondInterest( await lpContract.balanceOf( address ) );          

          marketPrice = reserves[1] / reserves[0];

          bondPrice = ( 2 * reserves[1] * ( lpBalance / totalLP ) ) / bondValue;
         // alert(reserves);
          
          vestingTerm = await bondingContract.bondingPeriodInBlocks();


          const totalDebtDo = await bondingContract.totalDebt();

          const ohmTotalSupply = await ohmContract.totalSupply();

        
          debtRatio = await bondingCalcContract.calcDebtRatio( totalDebtDo, ohmTotalSupply );


          lpBondAllowance = await lpContract.allowance( address, addresses[network.chainId].BOND_ADDRESS );


          const bondDetails = await bondingContract.depositorInfo( address );          

          bondDiscount = 1 - bondPrice / marketPrice;

          interestDue = bondDetails[2];
          principleDeposited = bondDetails[0];
          bondMaturationBlock = bondDetails[3];
        }  


        if(addresses[network.chainId].LP_ADDRESS) {
          lpContract = new ethers.Contract(addresses[network.chainId].LP_ADDRESS, ierc20Abi, provider);
          lpBalance = await lpContract.balanceOf(address);
        }  
        
        if(addresses[network.chainId].LPSTAKING_ADDRESS) {
          lpStakingContract = new ethers.Contract(addresses[network.chainId].LPSTAKING_ADDRESS, LPStaking, provider);
          lpContract = new ethers.Contract(addresses[network.chainId].LP_ADDRESS, ierc20Abi, provider);
          ohmContract = new ethers.Contract(addresses[network.chainId].OHM_ADDRESS, ierc20Abi, provider);

          totalLPStaked = await lpStakingContract.totalStaked();
          lpStaked = await lpStakingContract.getUserBalance( address );
          pendingRewards = await lpStakingContract.pendingRewards( address );
          lpStakeAllowance = await lpContract.allowance(address, addresses[state.network.chainId].LPSTAKING_ADDRESS);

          const totalLP = await lpContract.totalSupply();
          const OHMInLP = await ohmContract.balanceOf( addresses[network.chainId].LP_ADDRESS );

          const rewardPerBlock = await lpStakingContract.rewardPerBlock()

          // alert(totalLPStaked);
          // alert(OHMInLP);
          // alert(totalLP);

          lpStakingAPY = ( rewardPerBlock * 6650 * 366 * 100) / (totalLPStaked * OHMInLP / totalLP * 2 )
          //alert( lpStakingAPY );
        }    

        if(addresses[network.chainId].OHM_ADDRESS) {
          ohmContract = new ethers.Contract(addresses[network.chainId].OHM_ADDRESS, ierc20Abi, provider);
          ohmBalance = await ohmContract.balanceOf(address);
          stakeAllowance = await ohmContract.allowance(address, addresses[network.chainId].STAKING_ADDRESS)!;
        }          
        if(addresses[network.chainId].SOHM_ADDRESS) {        
          sohmContract = new ethers.Contract(addresses[network.chainId].SOHM_ADDRESS, ierc20Abi, provider);
          sohmMainContract = new ethers.Contract(addresses[network.chainId].SOHM_ADDRESS, sOHM, provider);

          sohmBalance = await sohmContract.balanceOf(address);
          unstakeAllowance = await sohmContract.allowance(address, addresses[network.chainId].STAKING_ADDRESS)!;
          circSupply = await sohmMainContract.circulatingSupply();
        }
        if(addresses[network.chainId].STAKING_ADDRESS) {        
          stakingContract = new ethers.Contract(addresses[network.chainId].STAKING_ADDRESS, OlympusStaking, provider);
          profit = await stakingContract.ohmToDistributeNextEpoch();
        }

        if(addresses[network.chainId].DISTRIBUTOR_ADDRESS) {        
          distributorContract = new ethers.Contract(addresses[network.chainId].DISTRIBUTOR_ADDRESS, DistributorContract, provider);
          sohmContract = new ethers.Contract(addresses[network.chainId].SOHM_ADDRESS, ierc20Abi, provider);

          circSupply = await sohmMainContract.circulatingSupply();

          stakingReward = await distributorContract.getCurrentRewardForNextEpoch();

          stakingRebase = stakingReward / circSupply;


          stakingAPY = Math.pow( ( 1 + stakingRebase ), 1095);
    
          console.log(stakingAPY)

          stakingAPY = stakingAPY * 100;

          stakingRebase = stakingRebase * 100;

          currentIndex = await sohmContract.balanceOf('0xA62Bee23497C920B94305FF68FA7b1Cd1e9FAdb2'); 
          
          nextEpochBlock = await distributorContract.nextEpochBlock();

          currentBlock = await provider.getBlockNumber();
        }
        //const balance = balanceBefore.toFixed(2);        
        console.log("Allowance", allowance);
        console.log("stakeAllowance", stakeAllowance);

        commit('set', { address });
        commit('set', {
          // name,
          balance: ethers.utils.formatEther(balance),
          aOHMBalance: aOHMBalance,
          network,
          loading: false,
          ohmBalance: ethers.utils.formatUnits(ohmBalance, 'gwei'),
          sohmBalance: ethers.utils.formatUnits(sohmBalance, 'gwei'),
          totalLPStaked: ethers.utils.formatUnits(totalLPStaked, 'ether'),
          lpBalance: ethers.utils.formatUnits(lpBalance, 'ether'),
          lpStaked: ethers.utils.formatUnits(lpStaked, 'ether'),
          pendingRewards: ethers.utils.formatUnits(pendingRewards, 'gwei'),
          lpStakingAPY: lpStakingAPY,
          stakingReward: ethers.utils.formatUnits(stakingReward, 'gwei'),
          stakingAPY: stakingAPY,
          stakingRebase: stakingRebase,
          currentIndex: ethers.utils.formatUnits(currentIndex, 'gwei'),
          nextEpochBlock: nextEpochBlock,
          currentBlock: currentBlock,
          vestingTerm: vestingTerm,
          bondValue: bondValue,
          bondPrice: bondPrice,
          marketPrice: marketPrice / 1000000000,
          debtRatio: debtRatio,
          interestDue: ethers.utils.formatUnits(interestDue, 'gwei'),
          principleDeposited: ethers.utils.formatUnits(principleDeposited, 'ether'),
          bondMaturationBlock: bondMaturationBlock,
          bondDiscount: bondDiscount
          
        });        
        commit('set', { allowance, stakeAllowance, unstakeAllowance, lpStakeAllowance, lpBondAllowance });
        dispatch('getAllotmentPerBuyer');
      } catch (error) {
        console.error(error);
      }
    } else {
      console.error('This website require MetaMask');
    }
  },
  loading: ({ commit }, payload) => {
    commit('set', { loading: payload });
  },
  async getExchangeRates({ commit }) {
    const exchangeRates = await getExchangeRatesFromCoinGecko();
    commit('set', { exchangeRates });
  },

  async calcBondDetails({ commit }, amount ) {
    const bondingContract = new ethers.Contract(addresses[state.network.chainId].BOND_ADDRESS, BondContract, provider);
    const bondingCalcContract = new ethers.Contract(addresses[state.network.chainId].BONDINGCALC_ADDRESS, BondCalcContract, provider);
    const pairContract = new ethers.Contract(addresses[state.network.chainId].LP_ADDRESS, PairContract, provider);
    const lpContract = new ethers.Contract(addresses[state.network.chainId].LP_ADDRESS, ierc20Abi, provider);
    const ohmContract = new ethers.Contract(addresses[state.network.chainId].OHM_ADDRESS, ierc20Abi, provider);
    
    const lpBalance = await lpContract.balanceOf(state.address);

    const totalLP = await lpContract.totalSupply();

    //alert(totalLP);

    const reserves = await pairContract.getReserves();

    const bondValue = await bondingContract.calculateBondInterest( amount );

    const marketPrice = reserves[1] / reserves[0];
    
    const bondPrice = ( 2 * reserves[1] * ( amount / totalLP ) ) / bondValue;

    commit('set', {
      bondValue: bondValue,
      bondPrice: bondPrice,
      marketPrice: marketPrice / 1000000000
    });

  },

  async getOHM({commit}, value) {
    const signer = provider.getSigner();  
    const presale = await new ethers.Contract(addresses[state.network.chainId].PRESALE_ADDRESS, OHMPreSale, signer);
    const daiContract = new ethers.Contract(addresses[state.network.chainId].DAI_ADDRESS, ierc20Abi, signer);

    const presaleTX = await presale.purchaseaOHM(ethers.utils.parseEther(value).toString());
    await presaleTX.wait(console.log("Success"));
    const balance = await daiContract.balanceOf(state.address);
    commit('set', {
      // name,
      balance: ethers.utils.formatEther(balance)})    
  },

  async getApproval({commit, dispatch}, value) {
    const signer = provider.getSigner();  
    const daiContract = await new ethers.Contract(addresses[state.network.chainId].DAI_ADDRESS, ierc20Abi, signer);
    
    if(value <= 0) return;

    const approveTx = await daiContract.approve(addresses[state.network.chainId].PRESALE_ADDRESS, ethers.utils.parseEther(value).toString());
    commit('set',{allowanceTx:1})
    await approveTx.wait();
    await dispatch('getAllowances')

  },

  async getAllowances({commit}) {
    if(state.address) {
    const diaContract = await new ethers.Contract(addresses[state.network.chainId].DAI_ADDRESS, ierc20Abi, provider);
    const allowance = await diaContract.allowance(state.address, addresses[state.network.chainId].PRESALE_ADDRESS);
    commit('set', {allowance});
    }
  },

  async getStakeApproval({commit, dispatch}, value) {
    const signer = provider.getSigner();  
    const ohmContract = await new ethers.Contract(addresses[state.network.chainId].OHM_ADDRESS, ierc20Abi, signer);
    if(value <= 0) return;

    const approveTx = await ohmContract.approve(addresses[state.network.chainId].STAKING_ADDRESS, ethers.utils.parseUnits('1000000000', 'gwei').toString());
    await approveTx.wait();
    await dispatch('getStakeAllowances')
  },

  async getLPStakeApproval({ commit, dispatch}, value) {
    const signer = provider.getSigner();  
    const lpContract = await new ethers.Contract(addresses[state.network.chainId].LP_ADDRESS, ierc20Abi, signer);
    if(value <= 0) return;

    const approveTx = await lpContract.approve(addresses[state.network.chainId].LPSTAKING_ADDRESS, ethers.utils.parseUnits('1000000000', 'ether').toString());
    await approveTx.wait();
    await dispatch('getLPStakeAllowance')
  },

  async getLPBondApproval({ commit, dispatch }, value ) {
    const signer = provider.getSigner();  
    const lpContract = await new ethers.Contract(addresses[state.network.chainId].LP_ADDRESS, ierc20Abi, signer);
    if(value <= 0) return;

    const approveTx = await lpContract.approve(addresses[state.network.chainId].BOND_ADDRESS, ethers.utils.parseUnits('1000000000', 'ether').toString());
    await approveTx.wait();
    await dispatch('getLPBondAllowance')

  },

  async getStakeAllowances({commit}) {
    if(state.address) {
    const ohmContract = await new ethers.Contract(addresses[state.network.chainId].OHM_ADDRESS, ierc20Abi, provider);
    const stakeAllowance = await ohmContract.allowance(state.address, addresses[state.network.chainId].STAKING_ADDRESS);
    commit('set', {stakeAllowance});
    }
  },

  async getLPStakeAllowance({commit}) {
    if(state.address) {
      const lpContract = await new ethers.Contract(addresses[state.network.chainId].LP_ADDRESS, ierc20Abi, provider);
      const lpStakeAllowance = await lpContract.allowance(state.address, addresses[state.network.chainId].LPSTAKING_ADDRESS);
      commit('set', {lpStakeAllowance});
    }
  },

  async getLPBondAllowance({commit}) {
    if(state.address) {
      const lpContract = await new ethers.Contract(addresses[state.network.chainId].LP_ADDRESS, ierc20Abi, provider);
      const lpBondAllowance = await lpContract.allowance(state.address, addresses[state.network.chainId].BOND_ADDRESS);
      commit('set', {lpBondAllowance});
    }
  },

  async getunStakeApproval({commit, dispatch}, value) {
    const signer = provider.getSigner();  
    const sohmContract = await new ethers.Contract(addresses[state.network.chainId].SOHM_ADDRESS, ierc20Abi, signer);
    if(value <= 0) return;

    const approveTx = await sohmContract.approve(addresses[state.network.chainId].STAKING_ADDRESS, ethers.utils.parseUnits('1000000000', 'gwei').toString());
    await approveTx.wait();
    await dispatch('getunStakeAllowances')
  },

  async getunStakeAllowances({commit}) {
    if(state.address) {
    const sohmContract = await new ethers.Contract(addresses[state.network.chainId].SOHM_ADDRESS, ierc20Abi, provider);
    const unstakeAllowance = await sohmContract.allowance(state.address, addresses[state.network.chainId].STAKING_ADDRESS);
    commit('set', {unstakeAllowance});
    }
  },  
  async calculateSaleQuote({commit}, value) {
      const presale = await new ethers.Contract(addresses[state.network.chainId].PRESALE_ADDRESS, OHMPreSale, provider);
      const amount = await presale.calculateSaleQuote(ethers.utils.parseUnits(value, 'ether'));
      commit('set', {amount:ethers.utils.formatUnits(amount.toString(), 'gwei').toString()});  
  },

  async getAllotmentPerBuyer({commit}) {
    const presale = await new ethers.Contract(addresses[state.network.chainId].PRESALE_ADDRESS, OHMPreSale, provider);
    const allotment = await presale.getAllotmentPerBuyer()
    commit('set', {allotment:ethers.utils.formatUnits(allotment, 'gwei')});
  },

  async getMaxPurchase({commit, dispatch}) {
      const presale = await new ethers.Contract(addresses[state.network.chainId].PRESALE_ADDRESS, OHMPreSale, provider);
      const salePrice = await presale.salePrice();
      const total = state.allotment * salePrice;    

      commit('set', {maxPurchase:ethers.utils.formatUnits(total.toString(), 'ether')})
  },

  async stakeOHM({commit}, value) {
    const signer = provider.getSigner();      
    const staking = await new ethers.Contract(addresses[state.network.chainId].STAKING_ADDRESS, OlympusStaking, signer);

    const stakeTx = await staking.stakeOHM(ethers.utils.parseUnits(value, 'gwei'));
    await stakeTx.wait();
    const ohmContract = new ethers.Contract(addresses[state.network.chainId].OHM_ADDRESS, ierc20Abi, provider);
    const ohmBalance = await ohmContract.balanceOf(state.address);
    const sohmContract = new ethers.Contract(addresses[state.network.chainId].SOHM_ADDRESS, ierc20Abi, provider);
    const sohmBalance = await sohmContract.balanceOf(state.address);   
    commit('set', {
      ohmBalance: ethers.utils.formatUnits(ohmBalance, 'gwei'),
      sohmBalance: ethers.utils.formatUnits(sohmBalance, 'gwei'),
    });          
  },
  async unstakeOHM({commit}, value) {
    const signer = provider.getSigner();      
    const staking = await new ethers.Contract(addresses[state.network.chainId].STAKING_ADDRESS, OlympusStaking, signer);
    console.log(ethers.utils.parseUnits(value, 'gwei').toString())
    const stakeTx = await staking.unstakeOHM(ethers.utils.parseUnits(value, 'gwei'));
    await stakeTx.wait();
    const ohmContract = new ethers.Contract(addresses[state.network.chainId].OHM_ADDRESS, ierc20Abi, provider);
    const ohmBalance = await ohmContract.balanceOf(state.address);
    const sohmContract = new ethers.Contract(addresses[state.network.chainId].SOHM_ADDRESS, ierc20Abi, provider);
    const sohmBalance = await sohmContract.balanceOf(state.address);   
    commit('set', {
      ohmBalance: ethers.utils.formatUnits(ohmBalance, 'gwei'),
      sohmBalance: ethers.utils.formatUnits(sohmBalance, 'gwei'),
    });          
  },

  async stakeLP({commit}, value) {
    const signer = provider.getSigner();      
    const staking = await new ethers.Contract(addresses[state.network.chainId].LPSTAKING_ADDRESS, LPStaking, signer);
    const stakeTx = await staking.stakeLP(ethers.utils.parseUnits(value, 'ether'));
    await stakeTx.wait();

    const lpContract = new ethers.Contract(addresses[state.network.chainId].LP_ADDRESS, ierc20Abi, provider);
    const lpBalance = await lpContract.balanceOf(state.address);
    const lpStakingContract = new ethers.Contract(addresses[state.network.chainId].LPSTAKING_ADDRESS, LPStaking, provider);
    const lpStaked = await lpStakingContract.getUserBalance(state.address);   
    commit('set', {
      lpBalance: ethers.utils.formatUnits(lpBalance, 'ether'),
      lpStaked: ethers.utils.formatUnits(lpStaked, 'ether')
    });  
  },

  async unstakeLP({commit}, value) {
    const signer = provider.getSigner();      
    const staking = await new ethers.Contract(addresses[state.network.chainId].LPSTAKING_ADDRESS, LPStaking, signer);
    const unstakeTx = await staking.unstakeLP();
    await unstakeTx.wait();

    const lpContract = new ethers.Contract(addresses[state.network.chainId].LP_ADDRESS, ierc20Abi, provider);
    const lpBalance = await lpContract.balanceOf(state.address);
    const lpStakingContract = new ethers.Contract(addresses[state.network.chainId].LPSTAKING_ADDRESS, LPStaking, provider);
    const lpStaked = await lpStakingContract.getUserBalance(state.address);   
    commit('set', {
      lpBalance: ethers.utils.formatUnits(lpBalance, 'ether'),
      lpStaked: ethers.utils.formatUnits(lpStaked, 'ether')
    });  
  },

  async claimRewards() {
    const signer = provider.getSigner();      
    const staking = await new ethers.Contract(addresses[state.network.chainId].LPSTAKING_ADDRESS, LPStaking, signer);
    const claimTx = await staking.claimRewards();
    await claimTx.wait();

  },

  async bondLP({commit}, value) {
    const signer = provider.getSigner();
    const bonding = await new ethers.Contract(addresses[state.network.chainId].BOND_ADDRESS, BondContract, signer);
    const bondTx = await bonding.depositBondPrinciple( ethers.utils.parseUnits( value, 'ether' ) );
    await bondTx.wait();

    const lpContract = new ethers.Contract(addresses[state.network.chainId].LP_ADDRESS, ierc20Abi, provider);
    const lpBalance = await lpContract.balanceOf(state.address);
    commit('set', {
      lpBalance: ethers.utils.formatUnits(lpBalance, 'ether')
    });
  },

  async redeemBond() {
    const signer = provider.getSigner();
    const bonding = await new ethers.Contract(addresses[state.network.chainId].BOND_ADDRESS, BondContract, signer);
    const redeemTx = await bonding.redeemBond( );
    await redeemTx.wait();

  },

  async forfeitBond() {
    const signer = provider.getSigner();
    const bonding = await new ethers.Contract(addresses[state.network.chainId].BOND_ADDRESS, BondContract, signer);
    const forfeitTx = await bonding.withdrawPrincipleAndForfeitInterest( );
    await forfeitTx.wait();
  },

  async getMaxSwap({commit, dispatch}) {
    const aOHMContract = await new ethers.Contract(addresses[state.network.chainId].AOHM_ADDRESS, ierc20Abi, provider);
    const aOHMBalanceBeforeDecimals = await aOHMContract.balanceOf( state.address );
    const aOHMBalance = aOHMBalanceBeforeDecimals / 1000000000;

    commit('set', { maxSwap: aOHMBalance });
},


  async migrateToOHM ({ commit }, value) {
    const signer = provider.getSigner();
    const migrateContact = await new ethers.Contract(addresses[state.network.chainId].MIGRATE_ADDRESS, MigrateToOHM, signer);

    const aOHMContract = await new ethers.Contract(addresses[state.network.chainId].AOHM_ADDRESS, ierc20Abi, provider);
    const aOHMContractWithSigner = aOHMContract.connect(signer);
    
    const allowance = await aOHMContract.allowance( state.address, addresses[state.network.chainId].MIGRATE_ADDRESS)

    if( allowance < value *  1000000000 ) {     
      const approveTx = await aOHMContractWithSigner.approve(addresses[state.network.chainId].MIGRATE_ADDRESS, parseEther((1e9).toString()));
      commit('set',{allowanceTx:1})
      await approveTx.wait(state.confirmations);       
    }

    const migrateTx = await migrateContact.migrate( value * 1000000000 );
    await migrateTx.wait();
  },

};

export default {
  state,
  mutations,
  actions
};

