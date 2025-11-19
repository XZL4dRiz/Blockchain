// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.30;

contract TokenContract {
    address public owner;

    struct Receivers {
        string name;
        uint256 tokens;
    }

    mapping(address => Receivers) public users;

    uint256 public tokenPrice = 5 ether; // Precio de 1 token en Ether

    modifier onlyOwner() {
        require(msg.sender == owner, "Solo el owner puede hacer esto");
        _;
    }

    constructor() payable {
        owner = msg.sender;
        users[owner].tokens = 100;
    }

    function double(uint _value) public pure returns (uint) {
        return _value * 2;
    }

    function register(string memory _name) public {
        users[msg.sender].name = _name;
    }

    function giveToken(address _receiver, uint256 _amount) onlyOwner public {
        require(users[owner].tokens >= _amount, "No hay suficientes tokens del owner");
        users[owner].tokens -= _amount;
        users[_receiver].tokens += _amount;
    }

    // Función para comprar tokens con Ether
    function buyTokens() public payable {
        require(msg.value >= tokenPrice, "No es suficiente Ether para comprar un token");
        uint256 tokensToBuy = msg.value / tokenPrice;
        require(users[owner].tokens >= tokensToBuy, "El owner no tiene suficientes tokens disponibles");

        users[owner].tokens -= tokensToBuy;
        users[msg.sender].tokens += tokensToBuy;

        emit TokensPurchased(msg.sender, tokensToBuy, msg.value);
    }

    // Para consultar el balance de Ether en el contrato
    function getContractEtherBalance() public view returns (uint256) {
        return address(this).balance;
    }

    event TokensPurchased(address buyer, uint256 amount, uint256 etherPaid);
}